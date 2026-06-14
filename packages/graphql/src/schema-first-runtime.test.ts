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

  it('fails when an SDL query field has no resolver binding', async () => {
    const schemaWithMissingQuery = `type Query {
  product(id: ID!): Product
  viewer: Product
}

type Product {
  id: ID!
  name: String!
}
`;

    await expect(
      generateSchemaFirstGraphqlRuntimeForResolvers([SchemaFirstStorefrontResolver], {
        schemaSdl: schemaWithMissingQuery,
        tsconfig,
      }),
    ).rejects.toThrow('Schema-first resolver binding missing for Query.viewer');
  });

  it('fails when an SDL mutation field has no resolver binding', async () => {
    const schemaWithMissingMutation = `type Query {
  product(id: ID!): Product
}

type Mutation {
  renameProduct(id: ID!, name: String!): Product
}

type Product {
  id: ID!
  name: String!
}
`;

    await expect(
      generateSchemaFirstGraphqlRuntimeForResolvers([SchemaFirstStorefrontResolver], {
        schemaSdl: schemaWithMissingMutation,
        tsconfig,
      }),
    ).rejects.toThrow('Schema-first resolver binding missing for Mutation.renameProduct');
  });

  it('allows object type fields without explicit resolver bindings', async () => {
    type ProductWithDescription = Product & {
      readonly description: string;
    };

    @Resolver()
    class ProductFieldDefaultResolver {
      @Query()
      product(input = readGraphqlArgs<{ readonly id: string }>()): ProductWithDescription {
        return { id: input.id, name: 'Desk Lamp', description: 'Adjustable task light' };
      }
    }

    const schemaWithObjectField = `type Query {
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
  description: String!
}
`;

    const runtime = await generateSchemaFirstGraphqlRuntimeForResolvers(
      [ProductFieldDefaultResolver],
      { schemaSdl: schemaWithObjectField, tsconfig },
    );

    expect(runtime.bindings['Product']?.['description']).toBeUndefined();

    const result = await executeGraphqlRequest({
      runtime,
      resolvers: [ProductFieldDefaultResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ product(id: "p_lamp") { id name description } }' },
    });

    expect(result).toEqual({
      data: {
        product: {
          id: 'p_lamp',
          name: 'Desk Lamp',
          description: 'Adjustable task light',
        },
      },
    });
  });
});
