import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { BuildTimeView, ZeltPlugin } from './config.types';
import { loadZeltConfig } from './config-loader.lib';
import { defineConfig } from './define-config.lib';

describe('defineConfig', () => {
  it('returns the config as-is', () => {
    const app = () => ({ http: { getMetadata: () => ({}) }, ready: async () => ({}) });

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
      readonly ready: () => Promise<object>;
      readonly http: { readonly getMetadata: () => object };
    };

    type StaticApp = BuildTimeView<App>;
    expectTypeOf<StaticApp>().toHaveProperty('http');
    expectTypeOf<StaticApp>().not.toHaveProperty('ready');

    const plugin: ZeltPlugin<StaticApp> = {
      name: 'typed-plugin',
      preBuild: async (ctx) => {
        const app = await ctx.loadStaticApp();
        expectTypeOf(app).toHaveProperty('http');
        expectTypeOf(app).not.toHaveProperty('ready');
      },
    };

    const app: App = { ready: async () => ({}), http: { getMetadata: () => ({}) } };
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
