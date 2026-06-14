import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runGraphqlCodegen } from './graphql.command';

describe('zelt graphql codegen', () => {
  it('passes schema and out paths to schema-first codegen without loading an app', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-'));
    const schema = join(dir, 'schema.graphql');
    const out = join(dir, 'generated.ts');
    await writeFile(schema, 'type Query { viewer: String }', 'utf8');
    const calls: unknown[] = [];

    await runGraphqlCodegen(
      dir,
      { schema: 'schema.graphql', out: 'generated.ts' },
      async (options) => {
        calls.push(options);
        await writeFile(options.out, '// generated\n', 'utf8');
        return { changed: true };
      },
    );

    expect(calls).toEqual([{ schema, out }]);
    await expect(readFile(out, 'utf8')).resolves.toBe('// generated\n');
  });
});
