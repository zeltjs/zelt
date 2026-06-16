import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { body, Controller, Post } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';
import { LocalArtifactController } from './_fixtures/http-local-schema-controller';
import type { ZeltConfig } from './config/config.types';
import {
  generateHttpInvocationArtifacts,
  invalidateHttpInvocationArtifacts,
} from './http-invocation-artifacts.lib';

@Controller('/artifact')
class ArtifactController {
  @Post('/')
  create(data = body('json')) {
    return data;
  }
}

const tsconfig = resolve(import.meta.dirname, '../tsconfig.json');

const writeFakeCoreRuntime = async (cwd: string): Promise<void> => {
  const packageDir = join(cwd, 'node_modules/@zeltjs/core');
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      type: 'module',
      exports: {
        '.': './index.mjs',
        './http-invocation-runtime': './http-invocation-runtime.mjs',
      },
    }),
    'utf8',
  );
  await writeFile(
    join(packageDir, 'index.mjs'),
    [
      'export const Controller = () => () => undefined;',
      'export const Post = () => () => undefined;',
      'export const validated = () => undefined;',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(packageDir, 'http-invocation-runtime.mjs'),
    [
      'export const validateBodyAsync = async (schema) => {',
      "  const result = await schema['~standard'].validate({ id: 'bundled-local' });",
      '  if (result.issues) throw new Error(result.issues[0]?.message ?? "invalid");',
      '  return result.value;',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
};

const runNode = async (cwd: string, scriptPath: string): Promise<string> =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile('node', [scriptPath], { cwd }, (error, stdout, stderr) => {
      if (error !== null) {
        rejectPromise(new Error(stderr || error.message));
        return;
      }
      resolvePromise(stdout.trim());
    });
  });

describe('generateHttpInvocationArtifacts', () => {
  it('writes HTTP invocation hooks and registry for a static HTTP app', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-cli-artifacts-'));
    const config: ZeltConfig = {
      app: () => ({ http: { getControllers: () => [ArtifactController] } }),
    };

    try {
      const result = await generateHttpInvocationArtifacts({
        cwd,
        config,
        loadStaticApp: async () => ({ http: { getControllers: () => [ArtifactController] } }),
        tsconfig,
      });

      expect(result).toEqual({
        registryPath: join(cwd, '.zelt/registry.mjs'),
        hookModulePath: join(cwd, '.zelt/http-invocation.ts'),
        artifactHash: expect.any(String),
        controllersHash: expect.any(String),
        hookModuleChanged: true,
        registryChanged: true,
      });

      const hookModule = await readFile(join(cwd, '.zelt/http-invocation.ts'), 'utf8');
      expect(hookModule).toContain("'POST /artifact ArtifactController.create': async (ctx) => [");

      const registry = await readFile(join(cwd, '.zelt/registry.mjs'), 'utf8');
      expect(registry).toContain('export const zeltRegistry = {');
      expect(registry).toContain('version: 1');
      expect(registry).toContain("new URL('./http-invocation.ts', import.meta.url).href");
      expect(registry).toContain(`artifactHash: '${result.artifactHash}'`);
      expect(registry).toContain(`controllersHash: '${result.controllersHash}'`);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('writes a minimal registry when the static app has no HTTP controllers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-cli-artifacts-no-http-'));
    const config: ZeltConfig = {
      app: () => ({}),
    };

    try {
      const result = await generateHttpInvocationArtifacts({
        cwd,
        config,
        loadStaticApp: async () => ({}),
        tsconfig,
      });

      expect(result.artifactHash).toBeUndefined();
      expect(result.controllersHash).toBeUndefined();
      expect(result.hookModuleChanged).toBe(false);
      expect(result.registryChanged).toBe(true);

      const registry = await readFile(join(cwd, '.zelt/registry.mjs'), 'utf8');
      expect(registry).toContain('version: 1');
      expect(registry).not.toContain('httpInvocation');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('writes JavaScript HTTP invocation artifacts for node runtime mode', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-cli-artifacts-node-'));
    const config: ZeltConfig = {
      app: () => ({ http: { getControllers: () => [ArtifactController] } }),
    };

    try {
      const result = await generateHttpInvocationArtifacts({
        cwd,
        config,
        loadStaticApp: async () => ({ http: { getControllers: () => [ArtifactController] } }),
        tsconfig,
        runtime: {
          kind: 'node',
        },
      });

      expect(result.hookModulePath).toBe(join(cwd, '.zelt/http-invocation.mjs'));

      const hookModule = await readFile(join(cwd, '.zelt/http-invocation.mjs'), 'utf8');
      expect(hookModule).toContain('httpInvocationHooks');
      expect(hookModule).toContain('POST /artifact ArtifactController.create');
      expect(hookModule).not.toContain('satisfies Readonly');
      expect(hookModule).not.toContain('type HttpInvocationHook');

      const registry = await readFile(join(cwd, '.zelt/registry.mjs'), 'utf8');
      expect(registry).toContain("new URL('./http-invocation.mjs', import.meta.url).href");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('bundles local validated schemas from decorator source into node runtime artifacts', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-cli-artifacts-node-local-'));
    const config: ZeltConfig = {
      app: () => ({ http: { getControllers: () => [LocalArtifactController] } }),
    };

    try {
      await writeFakeCoreRuntime(cwd);
      await generateHttpInvocationArtifacts({
        cwd,
        config,
        loadStaticApp: async () => ({
          http: { getControllers: () => [LocalArtifactController] },
        }),
        tsconfig,
        runtime: { kind: 'node' },
      });

      const hookModulePath = join(cwd, '.zelt/http-invocation.mjs');
      const hookModuleSource = await readFile(hookModulePath, 'utf8');
      expect(hookModuleSource).not.toContain('@Controller');
      expect(hookModuleSource).not.toContain('@Post');

      const runnerPath = join(cwd, 'run-hook.mjs');
      await writeFile(
        runnerPath,
        [
          "const mod = await import('./.zelt/http-invocation.mjs');",
          "const hook = mod.httpInvocationHooks['POST /local-artifact LocalArtifactController.create'];",
          "if (!hook) throw new Error('Generated local schema hook was not found');",
          'const result = await hook();',
          'console.log(JSON.stringify(result));',
          '',
        ].join('\n'),
        'utf8',
      );

      await expect(runNode(cwd, runnerPath)).resolves.toBe('[{"id":"bundled-local"}]');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('removes stale registry artifacts when invalidated', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-cli-artifacts-invalid-'));
    const registryPath = join(cwd, '.zelt/registry.mjs');

    try {
      await mkdir(join(cwd, '.zelt'), { recursive: true });
      await writeFile(registryPath, 'export const zeltRegistry = { version: 1 };\n', 'utf8');

      await invalidateHttpInvocationArtifacts({ cwd });

      await expect(access(registryPath)).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('invalidates stale registry when artifact generation fails', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-cli-artifacts-failure-'));
    const registryPath = join(cwd, '.zelt/registry.mjs');
    const config: ZeltConfig = {
      app: () => ({}),
    };

    try {
      await mkdir(join(cwd, '.zelt'), { recursive: true });
      await writeFile(registryPath, 'export const zeltRegistry = { version: 1 };\n', 'utf8');

      await expect(
        generateHttpInvocationArtifacts({
          cwd,
          config,
          loadStaticApp: async () => {
            throw new Error('static app failed');
          },
          tsconfig,
        }),
      ).rejects.toThrow('static app failed');

      await expect(access(registryPath)).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
