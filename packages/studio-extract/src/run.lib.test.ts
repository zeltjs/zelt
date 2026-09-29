import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveExtractConfig } from './core';
import { listIncludedFiles } from './extraction-program.lib';
import { extract } from './run.lib';

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    outDir: './dist',
    rootDir: '.',
    composite: true,
  },
  include: ['app/**/*'],
};

const configFor = (
  _root: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  version: 1,
  project: { id: 'demo', name: 'Demo' },
  root: '.',
  tsconfig: 'tsconfig.json',
  include: ['app/**/*.ts'],
  exclude: ['**/*.test.ts'],
  mapPackages: [],
  ignore: [],
  sourceText: ['app/**'],
  sourceModules: {},
  plugins: [],
  presentation: {
    id: 'demo',
    columns: [
      { id: 'column:app', label: 'App', width: 310, initiallyHidden: false },
      { id: 'column:other', label: 'Other', width: 310, initiallyHidden: true },
    ],
    rules: [{ files: ['app/**'], columnId: 'column:app' }],
    fallbackColumnId: 'column:other',
  },
  required: [],
  output: 'out.json',
  ...overrides,
});

const makeProject = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'zelt-extract-'));
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify(tsconfig));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), text);
  }
  return root;
};

describe('listIncludedFiles', () => {
  it('walks the literal prefix of each include pattern and applies exclude', async () => {
    const root = await makeProject({
      'app/a.ts': 'export const a = 1;\n',
      'app/nested/b.ts': 'export const b = 1;\n',
      'app/nested/b.test.ts': 'export const t = 1;\n',
      'other/c.ts': 'export const c = 1;\n',
    });
    const configFile = join(root, 'demo.extract.json');
    await writeFile(configFile, JSON.stringify(configFor(root)));
    const resolved = resolveExtractConfig(configFor(root), configFile);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const files = listIncludedFiles(resolved.config).map((f) => f.slice(root.length + 1));
    expect(files).toEqual(['app/a.ts', 'app/nested/b.ts']);
  });
});

describe('extract', () => {
  it('writes a snapshot that satisfies the v1 schema', async () => {
    const root = await makeProject({
      'app/a.ts':
        'export const LIMIT = 1;\nexport class Service {\n  run(): number {\n    return LIMIT;\n  }\n}\n',
    });
    const configFile = join(root, 'demo.extract.json');
    await writeFile(configFile, JSON.stringify(configFor(root)));

    const result = await extract(configFile);
    expect(result.kind).toBe('published');
    if (result.kind !== 'published') return;

    const written: unknown = JSON.parse(await readFile(result.output, 'utf8'));
    expect(written).toMatchObject({ schemaVersion: 1, provenance: 'extracted' });
    expect(result.snapshotId).toHaveLength(64);
  });

  it('writes the same snapshot for the same sources', async () => {
    const root = await makeProject({ 'app/a.ts': 'export const LIMIT = 1;\n' });
    const configFile = join(root, 'demo.extract.json');
    await writeFile(configFile, JSON.stringify(configFor(root)));

    const first = await extract(configFile);
    const second = await extract(configFile);
    expect(first.kind === 'published' && second.kind === 'published').toBe(true);
    if (first.kind !== 'published' || second.kind !== 'published') return;
    expect(first.snapshotId).toBe(second.snapshotId);
  });

  it('fails without writing when a required feature has no plugin', async () => {
    const root = await makeProject({ 'app/a.ts': 'export const LIMIT = 1;\n' });
    const configFile = join(root, 'demo.extract.json');
    await writeFile(
      configFile,
      JSON.stringify(configFor(root, { required: [{ provider: 'zelt', feature: 'routes' }] })),
    );

    const result = await extract(configFile);
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.phase).toBe('assembly');
    await expect(readFile(join(root, 'out.json'), 'utf8')).rejects.toThrow();
  });

  it('reports a config that cannot be read', async () => {
    const result = await extract(join(tmpdir(), 'zelt-extract-missing.json'));
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.phase).toBe('config');
  });

  it('fails when the include patterns match no file', async () => {
    const root = await makeProject({ 'other/a.ts': 'export const a = 1;\n' });
    const configFile = join(root, 'demo.extract.json');
    await writeFile(configFile, JSON.stringify(configFor(root)));

    const result = await extract(configFile);
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.phase).toBe('index');
  });
});
