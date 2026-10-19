import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { BuildTimeView, ZeltPlugin } from './config.types';
import { getConfigModuleLoader, loadZeltConfig } from './config-loader.lib';
import { defineConfig } from './define-config.lib';

describe('defineConfig', () => {
  it('returns the config as-is', () => {
    const app = () => ({ http: { getMetadata: () => ({}) }, createRuntime: async () => ({}) });

    const config = defineConfig({
      app,
      build: {
        entry: './src/main.ts',
        outDir: './dist',
      },
    });

    expect(config).toEqual({
      app,
      build: {
        entry: './src/main.ts',
        outDir: './dist',
      },
    });
  });

  it('exposes only build-time app capabilities to plugins', () => {
    type App = {
      readonly createRuntime: () => Promise<object>;
      readonly http: { readonly getMetadata: () => object };
    };

    type StaticApp = BuildTimeView<App>;
    expectTypeOf<StaticApp>().toHaveProperty('http');
    expectTypeOf<StaticApp>().not.toHaveProperty('createRuntime');

    const plugin: ZeltPlugin<StaticApp> = {
      name: 'typed-plugin',
      preBuild: async (ctx) => {
        const app = await ctx.loadStaticApp();
        expectTypeOf(app).toHaveProperty('http');
        expectTypeOf(app).not.toHaveProperty('createRuntime');
      },
    };

    const app: App = { createRuntime: async () => ({}), http: { getMetadata: () => ({}) } };
    const config = defineConfig({ app: () => app, plugins: [plugin] });

    expect(config.plugins).toEqual([plugin]);
  });
});

describe('loadZeltConfig', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `zelt-cli-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('shares application class identity with inspection and reloads the config file', async () => {
    const appFile = join(testDir, 'app.ts');
    await writeFile(appFile, 'export class Service { constructor(public value = 1) {} }');
    const configFile = join(testDir, 'zelt.config.ts');
    const source = (outDir: string) =>
      `export default { app: () => import('./app'), build: { outDir: '${outDir}' } };`;
    await writeFile(configFile, source('first'));
    const config = await loadZeltConfig({ cwd: testDir });
    const app = await config.app();
    const loadModule = getConfigModuleLoader(config);
    expect(loadModule).toBeDefined();
    const inspected = await loadModule?.(appFile);
    expect(inspected).toHaveProperty('Service', Reflect.get(app, 'Service'));
    await writeFile(appFile, 'export class Service { constructor(public value = 2) {} }');
    const refreshedConfig = await loadZeltConfig({ cwd: testDir });
    const reloadedApp = await refreshedConfig.app();
    expect(Reflect.get(reloadedApp, 'Service')).not.toBe(Reflect.get(app, 'Service'));
    expect(await getConfigModuleLoader(refreshedConfig)?.(appFile)).toHaveProperty(
      'Service',
      Reflect.get(reloadedApp, 'Service'),
    );
    await writeFile(configFile, source('second'));
    expect((await loadZeltConfig({ cwd: testDir })).build?.outDir).toBe('second');
  });

  it('loads zelt.config.ts from cwd', async () => {
    const configContent = `
      export default {
        app: () => ({ http: { getMetadata: () => ({}) } }),
        build: {
          entry: './src/app.ts',
          outDir: './build',
        },
      };
    `;
    await writeFile(join(testDir, 'zelt.config.ts'), configContent);

    const config = await loadZeltConfig({ cwd: testDir });

    expect(config.build?.entry).toBe('./src/app.ts');
    expect(config.build?.outDir).toBe('./build');
  });

  it('merges config with defaults', async () => {
    const configContent = `
      export default {
        app: () => ({ http: { getMetadata: () => ({}) } }),
        build: {
          entry: './src/main.ts',
        },
        dev: {
          port: 8080,
        },
      };
    `;
    await writeFile(join(testDir, 'zelt.config.ts'), configContent);

    const config = await loadZeltConfig({ cwd: testDir });

    expect(config.build?.entry).toBe('./src/main.ts');
    expect(config.build?.outDir).toBe('./dist');
    expect(config.dev?.port).toBe(8080);
    expect(config.dev?.debounceMs).toBe(300);
  });

  it('accepts cli entry config', async () => {
    await writeFile(
      join(testDir, 'zelt.config.ts'),
      `export default { app: () => ({}), cli: { entry: './src/cli.ts' } }`,
    );

    const config = await loadZeltConfig({ cwd: testDir });

    expect(config.cli?.entry).toBe('./src/cli.ts');
  });

  it('throws when config does not define an app loader', async () => {
    await writeFile(join(testDir, 'zelt.config.ts'), `export default {}`);

    await expect(loadZeltConfig({ cwd: testDir })).rejects.toThrow();
  });
});
