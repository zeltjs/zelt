import { resolve } from 'node:path';

import { Injectable } from '@zeltjs/core';
import { getOrCreateProgram } from '@zeltjs/decorator-metadata/inspect';
import type { ResolveError } from './app-type-resolver.service';
import { AppTypeResolverService } from './app-type-resolver.service';
import { emitAppType } from './emit.lib';
import type { ControllerClass, HttpMetadata } from './generator.types';

type TypeScriptModule = typeof import('typescript');
type TSProgram = import('typescript').Program;

export type PortableEmitContext = {
  readonly metadata: HttpMetadata;
  readonly controllers: readonly ControllerClass[];
  readonly distDir: string;
  readonly tsconfig: string;
  readonly projectRoot: string;
};

export type PortableEmitError =
  | ResolveError
  | { kind: 'source_emit_failed'; readonly message: string; readonly cause?: unknown }
  | { kind: 'tsconfig_error'; readonly message: string; readonly cause?: unknown };

export type PortableEmitResult =
  | { ok: true; readonly value: string }
  | { ok: false; readonly error: PortableEmitError };

@Injectable()
export class PortableAppTypeEmitterService {
  private readonly resolver = new AppTypeResolverService();

  async emit(ctx: PortableEmitContext): Promise<PortableEmitResult> {
    const sourceResult = this.emitSource(ctx);
    if (!sourceResult.ok) return sourceResult;

    const programResult = await this.loadProgram(ctx);
    if (!programResult.ok) return programResult;

    const { ts, program } = programResult.value;
    const compilerOptions = program.getCompilerOptions();
    const originalFileNames = program.getSourceFiles().map((sf) => sf.fileName);

    const result = this.resolver.resolve(
      sourceResult.value,
      compilerOptions,
      originalFileNames,
      ts,
      ctx.projectRoot,
      ctx.distDir,
    );
    if (!result.ok) return result;

    return { ok: true, value: result.value.portableOutput };
  }

  private emitSource(ctx: PortableEmitContext): PortableEmitResult {
    try {
      return {
        ok: true,
        value: emitAppType({
          metadata: ctx.metadata,
          controllers: ctx.controllers,
          distDir: ctx.distDir,
        }),
      };
    } catch (error) {
      return this.sourceEmitFailed(error);
    }
  }

  private async loadProgram(ctx: PortableEmitContext): Promise<ProgramLoadResult> {
    try {
      const programResult = await getOrCreateProgram(resolve(ctx.projectRoot, ctx.tsconfig));
      if (programResult.isOk()) return { ok: true, value: programResult.value };
      return this.tsconfigError(programResult.error.message, programResult.error);
    } catch (error) {
      return this.tsconfigError(this.errorMessage(error), error);
    }
  }

  private sourceEmitFailed(error: unknown): PortableEmitResult {
    return {
      ok: false,
      error: {
        kind: 'source_emit_failed',
        message: this.errorMessage(error),
        cause: error,
      },
    };
  }

  private tsconfigError(message: string, cause: unknown): ProgramLoadResult {
    return {
      ok: false,
      error: { kind: 'tsconfig_error', message, cause },
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}

type ProgramLoadResult =
  | { ok: true; readonly value: { readonly ts: TypeScriptModule; readonly program: TSProgram } }
  | { ok: false; readonly error: PortableEmitError };
