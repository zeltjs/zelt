import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeSchemaSdlHash, readGraphqlCodegenManifest } from './graphql-codegen-manifest.lib';
import { generateSchemaFirstCodegen, renderSchemaFirstCodegen } from './schema-first-codegen.lib';

describe('schema-first GraphQL codegen', () => {
  it('generates typed field helpers for Query fields', () => {
    const generated = renderSchemaFirstCodegen(`type Query {
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
}
`);

    expect(generated).toContain('export const schema = { sdl:');
    expect(generated).toContain('export namespace Gql');
    expect(generated).toContain('export namespace Query');
    expect(generated).toContain('export namespace product');
    expect(generated).toContain('export type Args = {');
    expect(generated).toContain('readonly id: string;');
    expect(generated).toContain('export type Result = Gql.Product | null;');
    expect(generated).toContain('export function args(): Args;');
    expect(generated).toContain('readGraphqlArgs<Args>()');
  });

  it('generates typed field helpers for Mutation fields', () => {
    const generated = renderSchemaFirstCodegen(`type Mutation {
  renameProduct(id: ID!, name: String!): Product!
}

type Query {
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
}
`);

    expect(generated).toContain('export namespace Mutation');
    expect(generated).toContain('export namespace renameProduct');
    expect(generated).toContain('readonly id: string;');
    expect(generated).toContain('readonly name: string;');
    expect(generated).toContain('export type Result = Gql.Product;');
  });

  it('maps nullable, non-null and list GraphQL types to TypeScript types', () => {
    const generated = renderSchemaFirstCodegen(`type Query {
  product(id: ID!): Product
  products(ids: [ID!]!): [Product!]!
}

type Product {
  id: ID!
  tags: [String]
}
`);

    expect(generated).toContain('readonly ids: readonly string[];');
    expect(generated).toContain('export type Result = readonly Gql.Product[];');
    expect(generated).toContain('readonly tags: readonly (string | null)[] | null;');
  });

  it('fails clearly for unsupported custom scalars', () => {
    expect(() =>
      renderSchemaFirstCodegen(`scalar DateTime

type Query {
  now: DateTime!
}
`),
    ).toThrow('Schema-first codegen does not support custom scalar "DateTime" yet.');
  });

  it('embeds the schema sdl as a GqlSchemaRef-compatible export', () => {
    const schemaSdl = `type Query {
  viewer: String
}
`;
    const generated = renderSchemaFirstCodegen(schemaSdl);
    expect(generated).toContain(
      `export const schema = { sdl: ${JSON.stringify(schemaSdl)} } as const;`,
    );
  });
});

describe('generateSchemaFirstCodegen manifest recording', () => {
  const schemaSdl = `type Query {
  viewer: String
}
`;

  it('records an entry in <cwd>/.zelt/graphql-codegen.json', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-'));
    const schema = join(cwd, 'schema.graphql');
    const out = join(cwd, 'generated.ts');
    await writeFile(schema, schemaSdl, 'utf8');

    await generateSchemaFirstCodegen({ schema, out, cwd });

    const entries = await readGraphqlCodegenManifest(cwd);
    expect(entries).toEqual([
      {
        sdlHash: await computeSchemaSdlHash(schemaSdl),
        schemaPath: resolve(schema),
        helperPath: resolve(out),
      },
    ]);
  });

  it('overwrites the manifest entry for the same helper on repeated runs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-overwrite-'));
    const schema = join(cwd, 'schema.graphql');
    const out = join(cwd, 'generated.ts');
    await writeFile(schema, schemaSdl, 'utf8');

    await generateSchemaFirstCodegen({ schema, out, cwd });
    await generateSchemaFirstCodegen({ schema, out, cwd });

    const entries = await readGraphqlCodegenManifest(cwd);
    expect(entries).toHaveLength(1);
  });

  it('keeps entries for different schemas/helpers separate and sorted', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-codegen-multi-'));
    const schemaA = join(cwd, 'a.graphql');
    const outA = join(cwd, 'a.ts');
    const schemaB = join(cwd, 'b.graphql');
    const outB = join(cwd, 'b.ts');
    await writeFile(schemaA, schemaSdl, 'utf8');
    await writeFile(schemaB, `type Query {\n  other: String\n}\n`, 'utf8');

    await generateSchemaFirstCodegen({ schema: schemaB, out: outB, cwd });
    await generateSchemaFirstCodegen({ schema: schemaA, out: outA, cwd });

    const entries = await readGraphqlCodegenManifest(cwd);
    expect(entries.map((entry) => entry.helperPath)).toEqual([resolve(outA), resolve(outB)]);
  });
});
