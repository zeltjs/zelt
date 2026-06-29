import { resolve } from 'node:path';

import { Controller } from '@zeltjs/core';
import { getOrCreateProgram } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';
import { AppTypeResolverService } from './app-type-resolver.service';
import { emitAppType } from './emit.lib';
import type { ControllerClass, HttpMetadata } from './generator.types';

@Controller('/users')
export class UserController {
  show(): { id: string; name: string } {
    return { id: '1', name: 'test' };
  }

  interfaceShow(): InterfaceUser {
    return { id: '1', profile: { displayName: 'test' } };
  }

  create(): { id: string; name: string } {
    return { id: '2', name: 'created' };
  }
}

export interface UserProfile {
  displayName: string;
}

export interface InterfaceUser {
  id: string;
  profile: UserProfile;
}

const metadata: HttpMetadata = {
  controllers: [
    {
      basePath: '/users',
      name: 'UserController',
      routes: [
        { method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' },
        {
          method: 'GET',
          path: '/interface',
          fullPath: '/users/interface',
          methodName: 'interfaceShow',
        },
        { method: 'POST', path: '/', fullPath: '/users', methodName: 'create' },
      ],
    },
  ],
};

const controllers: readonly ControllerClass[] = [UserController];

const tsconfigPath = resolve(__dirname, '../../tsconfig.json');
const projectRoot = resolve(__dirname, '../..');
const portableTestTimeout = 30_000;

const loadCompilerContext = async () => {
  const result = await getOrCreateProgram(tsconfigPath);
  if (result.isErr()) throw new Error(`Failed to load program: ${result.error.message}`);
  const { ts, program } = result.value;
  return {
    ts,
    compilerOptions: program.getCompilerOptions(),
    originalFileNames: program.getSourceFiles().map((sf) => sf.fileName),
  };
};

describe('resolveAppType', () => {
  const resolver = new AppTypeResolverService();

  it(
    'resolves BuildAppType to a fully expanded Hono type',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const distDir = resolve(__dirname, '../../generated');
      const sourceText = emitAppType({ metadata, controllers, distDir });

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        distDir,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const output = result.value.portableOutput;
      expect(output).not.toContain('UserController');
      expect(output).toContain('/users/:id');
      expect(output).toContain('/users');
      expect(output).toContain('$get');
      expect(output).toContain('$post');
    },
    portableTestTimeout,
  );

  it(
    'uses import() syntax for external packages',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const distDir = resolve(__dirname, '../../generated');
      const sourceText = emitAppType({ metadata, controllers, distDir });

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        distDir,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const output = result.value.portableOutput;
      expect(output).toContain("import('hono').Hono");
    },
    portableTestTimeout,
  );

  it(
    'does not contain local project file paths',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const distDir = resolve(__dirname, '../../generated');
      const sourceText = emitAppType({ metadata, controllers, distDir });

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        distDir,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.portableOutput).not.toContain(projectRoot);
    },
    portableTestTimeout,
  );

  it(
    'returns error when AppType is not found',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const sourceText = 'export type Foo = string;';

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        resolve(projectRoot, 'generated'),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.kind).toBe('type_not_found');
    },
    portableTestTimeout,
  );

  it(
    'resolves response types inline',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const distDir = resolve(__dirname, '../../generated');
      const sourceText = emitAppType({ metadata, controllers, distDir });

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        distDir,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.portableOutput).toContain('id: string');
      expect(result.value.portableOutput).toContain('name: string');
    },
    portableTestTimeout,
  );

  it(
    'inlines local interfaces recursively',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const distDir = resolve(__dirname, '../../generated');
      const sourceText = emitAppType({ metadata, controllers, distDir });

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        distDir,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const output = result.value.portableOutput;
      expect(output).not.toContain(projectRoot);
      expect(output).toMatch(/profile:\s*\(\{\s*displayName: string;/);
      expect(output).toContain('displayName: string');
    },
    portableTestTimeout,
  );

  it(
    'includes generated file header',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const distDir = resolve(__dirname, '../../generated');
      const sourceText = emitAppType({ metadata, controllers, distDir });

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        distDir,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.portableOutput).toContain('THIS FILE IS GENERATED');
      expect(result.value.portableOutput).toContain('export type AppType =');
    },
    portableTestTimeout,
  );

  it(
    'normalizes external module paths',
    async () => {
      const { ts, compilerOptions, originalFileNames } = await loadCompilerContext();
      const distDir = resolve(__dirname, '../../generated');
      const sourceText = emitAppType({ metadata, controllers, distDir });

      const result = resolver.resolve(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        distDir,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const output = result.value.portableOutput;
      expect(output).not.toContain('/dist/types/');
    },
    portableTestTimeout,
  );
});
