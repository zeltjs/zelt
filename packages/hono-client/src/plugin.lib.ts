import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { ZeltPlugin } from '@zeltjs/cli';
import type { HttpStaticCapabilities } from '@zeltjs/core';
import type { GenerateOptions } from './generator';
import { GeneratorService } from './generator';

type HttpStaticApp = {
  readonly http: HttpStaticCapabilities;
};

type HonoClientPluginBaseOptions = {
  readonly outDir?: string;
  readonly output?: string;
};

export type HonoClientPluginOptions = HonoClientPluginBaseOptions &
  (
    | {
        portable?: false;
        readonly tsconfig?: never;
      }
    | {
        portable: true;
        readonly tsconfig?: string;
      }
  );

const buildGenerateOptions = (
  options: HonoClientPluginOptions,
  ctx: { readonly cwd: string; readonly distDir: string },
): GenerateOptions => {
  if (!options.portable) return { distDir: ctx.distDir };
  return {
    distDir: ctx.distDir,
    portable: true,
    projectRoot: ctx.cwd,
    tsconfig: options.tsconfig ?? 'tsconfig.json',
  };
};

/** @throws {ZeltPluginConfigurationError | ZeltDecoratorUsageError | ZeltHonoClientGenerationError} */
export const honoClientPlugin = (
  options: HonoClientPluginOptions = {},
): ZeltPlugin<HttpStaticApp> => ({
  name: 'hono-client',
  async preBuild(ctx) {
    const app = await ctx.loadStaticApp();
    const distDir = options.outDir ?? './generated';
    const outputFilename = options.output ?? 'app-type.ts';
    const outputPath = resolve(ctx.cwd, distDir, outputFilename);
    const resolvedDistDir = resolve(ctx.cwd, distDir);
    const generator = new GeneratorService();

    const content = await generator.generateFromApp(
      {
        getMetadata: () => app.http.getMetadata(),
        getControllers: () => app.http.getControllers(),
      },
      buildGenerateOptions(options, { cwd: ctx.cwd, distDir: resolvedDistDir }),
    );

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  },
});
