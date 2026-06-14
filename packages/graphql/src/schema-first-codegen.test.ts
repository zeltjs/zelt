import { describe, expect, it } from 'vitest';

import { renderSchemaFirstCodegen } from './schema-first-codegen.lib';

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
    expect(generated).toContain('readonly tags?: readonly (string | null)[] | null;');
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
});
