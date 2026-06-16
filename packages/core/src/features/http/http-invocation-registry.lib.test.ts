import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { http } from './http.feature';
import { loadHttpInvocationHooksFromRegistry } from './http-invocation-registry.lib';
import { Controller } from './routing/controller.decorator';
import { Post } from './routing/http-method.decorator';

@Controller('/registry-runtime')
class RegistryRuntimeController {
  @Post('/')
  create(data?: unknown) {
    return data;
  }
}

const hashText = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('loadHttpInvocationHooksFromRegistry', () => {
  it('loads HTTP invocation hooks from .zelt registry', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-core-registry-'));
    const artifactDir = join(cwd, '.zelt');

    try {
      await mkdir(artifactDir, { recursive: true });
      const hookModuleSource = [
        'export const httpInvocationHooks = {',
        "  'POST /registry RegistryController.create': async () => ['from-registry'],",
        '};',
        '',
      ].join('\n');
      await writeFile(
        join(artifactDir, 'http-invocation.mjs'),
        hookModuleSource,
      );
      await writeFile(
        join(artifactDir, 'registry.mjs'),
        [
          'export const zeltRegistry = {',
          '  version: 1,',
          '  httpInvocation: {',
          '    version: 1,',
          "    module: new URL('./http-invocation.mjs', import.meta.url).href,",
          `    artifactHash: '${hashText(hookModuleSource)}',`,
          "    generatedAt: '2026-06-15T00:00:00.000Z',",
          "    controllersHash: 'test',",
          '  },',
          '};',
          '',
        ].join('\n'),
      );

      const hooks = await loadHttpInvocationHooksFromRegistry({ cwd });

      expect(hooks).toHaveProperty('POST /registry RegistryController.create');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('returns undefined when registry is missing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-core-registry-missing-'));

    try {
      await expect(loadHttpInvocationHooksFromRegistry({ cwd })).resolves.toBeUndefined();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('throws a clear error for unsupported registry versions', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-core-registry-version-'));
    const artifactDir = join(cwd, '.zelt');

    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        join(artifactDir, 'registry.mjs'),
        [
          'export const zeltRegistry = {',
          '  version: 2,',
          '};',
          '',
        ].join('\n'),
      );

      await expect(loadHttpInvocationHooksFromRegistry({ cwd })).rejects.toThrow(
        'Unsupported .zelt registry version 2; expected 1.',
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the HTTP invocation artifact version is unsupported', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-core-registry-artifact-version-'));
    const artifactDir = join(cwd, '.zelt');

    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(join(artifactDir, 'http-invocation.mjs'), 'export const httpInvocationHooks = {};\n');
      await writeFile(
        join(artifactDir, 'registry.mjs'),
        [
          'export const zeltRegistry = {',
          '  version: 1,',
          '  httpInvocation: {',
          '    version: 2,',
          "    module: new URL('./http-invocation.mjs', import.meta.url).href,",
          "    artifactHash: 'unused',",
          '  },',
          '};',
          '',
        ].join('\n'),
      );

      await expect(loadHttpInvocationHooksFromRegistry({ cwd })).rejects.toThrow(
        'Unsupported HTTP invocation artifact version 2; expected 1.',
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the HTTP invocation module URL is malformed', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-core-registry-module-url-'));
    const artifactDir = join(cwd, '.zelt');

    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(
        join(artifactDir, 'registry.mjs'),
        [
          'export const zeltRegistry = {',
          '  version: 1,',
          '  httpInvocation: {',
          '    version: 1,',
          "    module: 'not a url',",
          "    artifactHash: 'unused',",
          '  },',
          '};',
          '',
        ].join('\n'),
      );

      await expect(loadHttpInvocationHooksFromRegistry({ cwd })).rejects.toThrow(
        'HTTP invocation registry module URL is malformed: not a url.',
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the HTTP invocation artifact hash does not match', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-core-registry-artifact-hash-'));
    const artifactDir = join(cwd, '.zelt');

    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(join(artifactDir, 'http-invocation.mjs'), 'export const httpInvocationHooks = {};\n');
      await writeFile(
        join(artifactDir, 'registry.mjs'),
        [
          'export const zeltRegistry = {',
          '  version: 1,',
          '  httpInvocation: {',
          '    version: 1,',
          "    module: new URL('./http-invocation.mjs', import.meta.url).href,",
          "    artifactHash: 'stale-hash',",
          '  },',
          '};',
          '',
        ].join('\n'),
      );

      await expect(loadHttpInvocationHooksFromRegistry({ cwd })).rejects.toThrow(
        'HTTP invocation artifact hash mismatch',
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('lets HttpService build routes with hooks loaded from the cwd registry', async () => {
    const originalCwd = process.cwd();
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-core-registry-runtime-'));
    const artifactDir = join(cwd, '.zelt');

    try {
      await mkdir(artifactDir, { recursive: true });
      const hookModuleSource = [
        'export const httpInvocationHooks = {',
        "  'POST /registry-runtime RegistryRuntimeController.create': async (ctx) => [ctx.body('json')],",
        '};',
        '',
      ].join('\n');
      await writeFile(
        join(artifactDir, 'http-invocation.mjs'),
        hookModuleSource,
      );
      await writeFile(
        join(artifactDir, 'registry.mjs'),
        [
          'export const zeltRegistry = {',
          '  version: 1,',
          '  httpInvocation: {',
          '    version: 1,',
          "    module: new URL('./http-invocation.mjs', import.meta.url).href,",
          `    artifactHash: '${hashText(hookModuleSource)}',`,
          "    generatedAt: '2026-06-15T00:00:00.000Z',",
          "    controllersHash: 'runtime-test',",
          '  },',
          '};',
          '',
        ].join('\n'),
      );

      process.chdir(cwd);
      const app = createApp([http({ controllers: [RegistryRuntimeController] })]);
      const runtime = await app.createRuntime();
      const response = await runtime.http.fetch(
        new Request('https://example.com/registry-runtime', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ source: 'registry' }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ source: 'registry' });
    } finally {
      process.chdir(originalCwd);
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
