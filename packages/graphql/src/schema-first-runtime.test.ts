import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { readGraphqlArgs } from './args.lib';
import { executeGraphqlRequest } from './graphql-runtime.lib';
import { Query, Resolver } from './index';
import { generateSchemaFirstGraphqlRuntimeForResolvers } from './schema-first-runtime.lib';

type Product = {
  readonly id: string;
  readonly name: string;
};

@Resolver()
class SchemaFirstStorefrontResolver {
  @Query()
  product(input = readGraphqlArgs<{ readonly id: string }>()): Product {
    return { id: input.id, name: 'Desk Lamp' };
  }
}

@Resolver()
class SchemaFirstNamedStorefrontResolver {
  @Query('product')
  findProduct(input = readGraphqlArgs<{ readonly id: string }>()): Product {
    return { id: input.id, name: 'Desk Lamp' };
  }
}

describe('schema-first GraphQL runtime generation', () => {
  const tsconfig = resolve(__dirname, '../tsconfig.json');
  const schemaSdl = `type Query {
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
}
`;

  it('builds a runtime manifest from SDL and resolver metadata', async () => {
    const runtime = await generateSchemaFirstGraphqlRuntimeForResolvers(
      [SchemaFirstStorefrontResolver],
      { schemaSdl, tsconfig },
    );

    expect(runtime).toEqual({
      schemaSdl,
      bindings: {
        Query: {
          product: { resolver: 'SchemaFirstStorefrontResolver', method: 'product' },
        },
      },
    });

    const result = await executeGraphqlRequest({
      runtime,
      resolvers: [SchemaFirstStorefrontResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ product(id: "p_lamp") { id name } }' },
    });

    expect(result).toEqual({
      data: {
        product: { id: 'p_lamp', name: 'Desk Lamp' },
      },
    });
  });

  it('binds explicit decorator field names without changing the method name', async () => {
    const runtime = await generateSchemaFirstGraphqlRuntimeForResolvers(
      [SchemaFirstNamedStorefrontResolver],
      { schemaSdl, tsconfig },
    );

    expect(runtime.bindings['Query']?.['product']).toEqual({
      resolver: 'SchemaFirstNamedStorefrontResolver',
      method: 'findProduct',
    });
  });

  it('fails clearly when a root method does not match the schema field', async () => {
    @Resolver()
    class MismatchedResolver {
      @Query()
      missing(): Product {
        return { id: 'p_lamp', name: 'Desk Lamp' };
      }
    }

    await expect(
      generateSchemaFirstGraphqlRuntimeForResolvers([MismatchedResolver], { schemaSdl, tsconfig }),
    ).rejects.toThrow(
      'Schema-first binding currently requires method name to match field name: Query.missing',
    );
  });
});
