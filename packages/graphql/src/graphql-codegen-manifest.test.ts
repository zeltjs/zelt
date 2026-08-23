import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  computeSchemaSdlHash,
  findGraphqlCodegenManifestEntryBySdlHash,
  readGraphqlCodegenManifest,
  upsertGraphqlCodegenManifestEntry,
} from './graphql-codegen-manifest.lib';

describe('computeSchemaSdlHash', () => {
  it('is deterministic for the same SDL', async () => {
    const a = await computeSchemaSdlHash('type Query { viewer: String }');
    const b = await computeSchemaSdlHash('type Query { viewer: String }');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the SDL changes', async () => {
    const a = await computeSchemaSdlHash('type Query { viewer: String }');
    const b = await computeSchemaSdlHash('type Query { other: String }');
    expect(a).not.toBe(b);
  });
});

describe('graphql codegen manifest', () => {
  it('records an entry that can be read back', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-'));
    await upsertGraphqlCodegenManifestEntry(cwd, {
      sdlHash: 'hash-a',
      schemaPath: resolve(cwd, 'schema.graphql'),
      helperPath: resolve(cwd, 'generated.ts'),
    });

    const entries = await readGraphqlCodegenManifest(cwd);
    expect(entries).toEqual([
      {
        sdlHash: 'hash-a',
        schemaPath: resolve(cwd, 'schema.graphql'),
        helperPath: resolve(cwd, 'generated.ts'),
      },
    ]);
  });

  it('overwrites the existing entry keyed by helperPath', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-overwrite-'));
    const helperPath = resolve(cwd, 'generated.ts');
    await upsertGraphqlCodegenManifestEntry(cwd, {
      sdlHash: 'hash-old',
      schemaPath: resolve(cwd, 'schema.graphql'),
      helperPath,
    });
    await upsertGraphqlCodegenManifestEntry(cwd, {
      sdlHash: 'hash-new',
      schemaPath: resolve(cwd, 'schema.graphql'),
      helperPath,
    });

    const entries = await readGraphqlCodegenManifest(cwd);
    expect(entries).toEqual([
      { sdlHash: 'hash-new', schemaPath: resolve(cwd, 'schema.graphql'), helperPath },
    ]);
  });

  it('keeps entries sorted deterministically by helperPath', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-sort-'));
    await upsertGraphqlCodegenManifestEntry(cwd, {
      sdlHash: 'hash-b',
      schemaPath: resolve(cwd, 'b.graphql'),
      helperPath: resolve(cwd, 'b.ts'),
    });
    await upsertGraphqlCodegenManifestEntry(cwd, {
      sdlHash: 'hash-a',
      schemaPath: resolve(cwd, 'a.graphql'),
      helperPath: resolve(cwd, 'a.ts'),
    });

    const entries = await readGraphqlCodegenManifest(cwd);
    expect(entries.map((entry) => entry.helperPath)).toEqual([
      resolve(cwd, 'a.ts'),
      resolve(cwd, 'b.ts'),
    ]);

    const raw = await readFile(resolve(cwd, '.zelt', 'graphql-codegen.json'), 'utf8');
    expect(raw.indexOf('a.ts')).toBeLessThan(raw.indexOf('b.ts'));
  });

  it('returns an empty list when no manifest exists yet', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-missing-'));
    await expect(readGraphqlCodegenManifest(cwd)).resolves.toEqual([]);
  });

  it('keeps every entry when many upserts for distinct helperPaths run concurrently', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-concurrent-'));
    const entries = Array.from({ length: 10 }, (_, index) => ({
      sdlHash: `hash-${index}`,
      schemaPath: resolve(cwd, `schema-${index}.graphql`),
      helperPath: resolve(cwd, `generated-${index}.ts`),
    }));

    await Promise.all(entries.map((entry) => upsertGraphqlCodegenManifestEntry(cwd, entry)));

    const stored = await readGraphqlCodegenManifest(cwd);
    expect(new Set(stored.map((entry) => entry.helperPath))).toEqual(
      new Set(entries.map((entry) => entry.helperPath)),
    );
    expect(stored).toHaveLength(entries.length);
  });
});

describe('findGraphqlCodegenManifestEntryBySdlHash', () => {
  it('returns missing when no entry matches the hash', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-find-missing-'));
    await expect(findGraphqlCodegenManifestEntryBySdlHash(cwd, 'unknown')).resolves.toEqual({
      kind: 'missing',
    });
  });

  it('returns the entry when exactly one matches the hash', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-find-one-'));
    const entry = {
      sdlHash: 'hash-a',
      schemaPath: resolve(cwd, 'schema.graphql'),
      helperPath: resolve(cwd, 'generated.ts'),
    };
    await upsertGraphqlCodegenManifestEntry(cwd, entry);

    await expect(findGraphqlCodegenManifestEntryBySdlHash(cwd, 'hash-a')).resolves.toEqual({
      kind: 'found',
      entry,
    });
  });

  it('returns ambiguous when multiple helpers share the same hash', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-manifest-find-ambiguous-'));
    const entryA = {
      sdlHash: 'shared-hash',
      schemaPath: resolve(cwd, 'schema.graphql'),
      helperPath: resolve(cwd, 'a.ts'),
    };
    const entryB = {
      sdlHash: 'shared-hash',
      schemaPath: resolve(cwd, 'schema.graphql'),
      helperPath: resolve(cwd, 'b.ts'),
    };
    await upsertGraphqlCodegenManifestEntry(cwd, entryA);
    await upsertGraphqlCodegenManifestEntry(cwd, entryB);

    const result = await findGraphqlCodegenManifestEntryBySdlHash(cwd, 'shared-hash');
    expect(result.kind).toBe('ambiguous');
    if (result.kind !== 'ambiguous') throw new Error('expected ambiguous result');
    expect(result.entries).toEqual(expect.arrayContaining([entryA, entryB]));
  });
});
