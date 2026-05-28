import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadZeltConfig } from './config-loader.lib';
import { defineConfig } from './define-config.lib';

describe('defineConfig', () => {
  it('returns the config as-is', () => {
    const config = defineConfig({
      build: {
        entry: './src/main.ts',
        outDir: './dist',
      },
    });

    expect(config).toEqual({
      build: {
        entry: './src/main.ts',
        outDir: './dist',
      },
    });
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

  it('returns defaults when no config file exists', async () => {
    const config = await loadZeltConfig({ cwd: testDir });

    expect(config.build?.outDir).toBe('./dist');
    expect(config.build?.platform).toBe('node');
    expect(config.build?.format).toBe('esm');
    expect(config.dev?.port).toBe(3000);
    expect(config.dev?.debounceMs).toBe(300);
  });

  it('merges config with defaults', async () => {
    const configContent = `
      export default {
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
      `export default { cli: { entry: './src/cli.ts' } }`,
    );

    const config = await loadZeltConfig({ cwd: testDir });

    expect(config.cli?.entry).toBe('./src/cli.ts');
  });
});
