import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defineConfig } from './define-config';
import { loadZeltConfig } from './loader';

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

    const result = await loadZeltConfig({ cwd: testDir });

    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
    expect(config.build?.entry).toBe('./src/app.ts');
    expect(config.build?.outDir).toBe('./build');
  });

  it('returns defaults when no config file exists', async () => {
    const result = await loadZeltConfig({ cwd: testDir });

    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
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

    const result = await loadZeltConfig({ cwd: testDir });

    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
    expect(config.build?.entry).toBe('./src/main.ts');
    expect(config.build?.outDir).toBe('./dist');
    expect(config.dev?.port).toBe(8080);
    expect(config.dev?.debounceMs).toBe(300);
  });

  it('accepts commands glob pattern', async () => {
    await writeFile(
      join(testDir, 'zelt.config.ts'),
      `export default { commands: 'src/commands/**/*.ts' }`,
    );

    const result = await loadZeltConfig({ cwd: testDir });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.commands).toBe('src/commands/**/*.ts');
    }
  });

  it('loads legacy top-level fields for backward compatibility', async () => {
    const configContent = `
      export default {
        controllers: ['./src/**/*.controller.ts'],
        dist: './generated',
        tsconfig: './tsconfig.json',
      };
    `;
    await writeFile(join(testDir, 'zelt.config.ts'), configContent);

    const result = await loadZeltConfig({ cwd: testDir });

    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
    expect(config.controllers).toEqual(['./src/**/*.controller.ts']);
    expect(config.dist).toBe('./generated');
    expect(config.tsconfig).toBe('./tsconfig.json');
  });
});
