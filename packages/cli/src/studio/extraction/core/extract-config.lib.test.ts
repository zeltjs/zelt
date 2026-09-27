import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveExtractConfig } from './extract-config.lib';

// cwd はルート実行と packages/cli 実行で変わるため、このファイルからの相対で辿る
const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../../..');
const EC_CONFIG = join(REPO_ROOT, 'mocks/studio-spatial/ec-backend.extract.json');

const minimal = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: 1,
  project: { id: 'p', name: 'p' },
  root: '.',
  tsconfig: 'tsconfig.json',
  include: ['src/**/*.ts'],
  exclude: ['**/*.test.ts'],
  mapPackages: [],
  ignore: [],
  sourceText: ['src/**'],
  sourceModules: {},
  plugins: [],
  presentation: {
    id: 'demo',
    columns: [
      { id: 'column:a', label: 'A', width: 310, initiallyHidden: false },
      { id: 'column:other', label: 'Other', width: 310, initiallyHidden: true },
    ],
    rules: [{ files: ['src/entry/**'], columnId: 'column:a' }],
    fallbackColumnId: 'column:other',
  },
  required: [],
  output: 'out.json',
  ...overrides,
});

describe('resolveExtractConfig', () => {
  it('accepts the ec-backend config shipped with the mock', async () => {
    const raw: unknown = JSON.parse(await readFile(EC_CONFIG, 'utf8'));
    const result = resolveExtractConfig(raw, EC_CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.root).toBe(REPO_ROOT);
    expect(result.config.tsconfig).toBe(join(REPO_ROOT, 'integration/ec-backend/tsconfig.json'));
    expect(result.config.sourceModules['@zeltjs/core']).toBe(
      join(REPO_ROOT, 'packages/core/src/index.ts'),
    );
  });

  it('puts a file in the first matching column rule and falls back otherwise', () => {
    const result = resolveExtractConfig(minimal(), '/repo/x.extract.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.columnIdFor('src/entry/a.ts')).toBe('column:a');
    expect(result.config.columnIdFor('src/usecase/a.ts')).toBe('column:other');
  });

  it('applies include minus exclude', () => {
    const result = resolveExtractConfig(minimal(), '/repo/x.extract.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.isIncluded('src/a.ts')).toBe(true);
    expect(result.config.isIncluded('src/a.test.ts')).toBe(false);
    expect(result.config.isIncluded('e2e/a.ts')).toBe(false);
  });

  it('rejects a rule that points at an unknown column', () => {
    const result = resolveExtractConfig(
      minimal({
        presentation: {
          id: 'demo',
          columns: [{ id: 'column:a', label: 'A', width: 1, initiallyHidden: false }],
          rules: [{ files: ['src/**'], columnId: 'column:missing' }],
          fallbackColumnId: 'column:a',
        },
      }),
      '/repo/x.extract.json',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain('unknown column id');
  });

  it('rejects duplicate column ids', () => {
    const result = resolveExtractConfig(
      minimal({
        presentation: {
          id: 'demo',
          columns: [
            { id: 'column:a', label: 'A', width: 1, initiallyHidden: false },
            { id: 'column:a', label: 'A2', width: 1, initiallyHidden: false },
          ],
          rules: [],
          fallbackColumnId: 'column:a',
        },
      }),
      '/repo/x.extract.json',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain('duplicate column id');
  });

  it('rejects duplicate plugin ids', () => {
    const result = resolveExtractConfig(
      minimal({ plugins: [{ id: 'valibot' }, { id: 'valibot' }] }),
      '/repo/x.extract.json',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toContain('duplicate plugin id');
  });

  it('rejects an output outside the project root', () => {
    const result = resolveExtractConfig(
      minimal({ output: '../escape.json' }),
      '/repo/x.extract.json',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe('output');
  });

  it('rejects a config whose shape does not match the schema', () => {
    const result = resolveExtractConfig({ version: 2 }, '/repo/x.extract.json');
    expect(result.ok).toBe(false);
  });
});
