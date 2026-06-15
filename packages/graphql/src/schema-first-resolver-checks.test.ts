import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { Query, Resolver } from './index';
import {
  generateSchemaFirstResolverChecks,
  renderSchemaFirstResolverChecks,
} from './schema-first-resolver-checks.lib';

type Product = {
  readonly id: string;
  readonly name: string;
};

type Viewer = {
  readonly id: string;
};

@Resolver()
class SchemaFirstCheckStorefrontResolver {
  @Query()
  product(input = { id: 'p_lamp' }): Product | null {
    return { id: input.id, name: 'Desk Lamp' };
  }
}

@Resolver()
class SchemaFirstCheckNamedStorefrontResolver {
  @Query('product')
  findProduct(input = { id: 'p_lamp' }): Promise<Product | null> {
    return Promise.resolve({ id: input.id, name: 'Desk Lamp' });
  }
}

@Resolver()
class SchemaFirstCheckViewerResolver {
  @Query()
  viewer(): Viewer {
    return { id: 'viewer_1' };
  }
}

describe('schema-first resolver checks generation', () => {
  const tsconfig = resolve(__dirname, '../tsconfig.json');
  const schemaSdl = `type Query {
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
}
`;
  const viewerSchemaSdl = `type Query {
  viewer: Viewer!
}

type Viewer {
  id: ID!
}
`;

  it('generates args, optional args and return checks for root Query fields', async () => {
    const generated = await renderSchemaFirstResolverChecks({
      schemaSdl,
      resolvers: [SchemaFirstCheckStorefrontResolver],
      tsconfig,
      out: resolve(__dirname, 'generated/graphql-resolver-checks.ts'),
      gqlTypesImport: './graphql',
    });

    expect(generated).toContain("import type { Gql } from './graphql';");
    expect(generated).toContain('SchemaFirstCheckStorefrontResolver');
    expect(generated).toContain("FirstArg<SchemaFirstCheckStorefrontResolver['product']>");
    expect(generated).toContain('Gql.Query.product.Args');
    expect(generated).toContain('Gql.Query.product.Result');
    expect(generated).toContain(
      "AssertTrue<IsMutuallyAssignable<Exclude<FirstArg<SchemaFirstCheckStorefrontResolver['product']>, undefined>, Gql.Query.product.Args>>",
    );
    expect(generated).toContain('AssertTrue<IsOptionalArg<');
    expect(generated).toContain(
      "AssertTrue<HasCompatibleTailParams<SchemaFirstCheckStorefrontResolver['product']>>",
    );
    expect(generated).toContain('AwaitedValue<ReturnType<');
    expect(generated).not.toContain('AllowsNoArgsField<SchemaFirstCheckStorefrontResolver');
  });

  it('uses explicit decorator field names while checking the implementation method', async () => {
    const generated = await renderSchemaFirstResolverChecks({
      schemaSdl,
      resolvers: [SchemaFirstCheckNamedStorefrontResolver],
      tsconfig,
      out: resolve(__dirname, 'generated/graphql-resolver-checks.ts'),
      gqlTypesImport: './graphql',
    });

    expect(generated).toContain("FirstArg<SchemaFirstCheckNamedStorefrontResolver['findProduct']>");
    expect(generated).toContain('Gql.Query.product.Args');
    expect(generated).toContain('Gql.Query.product.Result');
  });

  it('allows no-parameter root operation methods for fields without SDL args', async () => {
    const generated = await renderSchemaFirstResolverChecks({
      schemaSdl: viewerSchemaSdl,
      resolvers: [SchemaFirstCheckViewerResolver],
      tsconfig,
      out: resolve(__dirname, 'generated/graphql-resolver-checks.ts'),
      gqlTypesImport: './graphql',
    });

    expect(generated).toContain("ReturnType<SchemaFirstCheckViewerResolver['viewer']>");
    expect(generated).toContain(
      "AssertTrue<AllowsNoArgsField<SchemaFirstCheckViewerResolver['viewer'], Gql.Query.viewer.Args>>",
    );
    expect(generated).toContain(
      ': IsMutuallyAssignable<Exclude<FirstArg<Fn>, undefined>, Args> extends true',
    );
    expect(generated).toContain('type HasCompatibleTailParams<Fn>');
    expect(generated).toContain('? HasCompatibleTailParams<Fn>');
    expect(generated).not.toContain(
      "IsOptionalArg<FirstArg<SchemaFirstCheckViewerResolver['viewer']>>",
    );
    expect(generated).not.toContain(
      "Exclude<FirstArg<SchemaFirstCheckViewerResolver['viewer']>, undefined>",
    );
  });

  it('deduplicates repeated resolver classes', async () => {
    const generated = await renderSchemaFirstResolverChecks({
      schemaSdl,
      resolvers: [SchemaFirstCheckStorefrontResolver, SchemaFirstCheckStorefrontResolver],
      tsconfig,
      out: resolve(__dirname, 'generated/graphql-resolver-checks.ts'),
      gqlTypesImport: './graphql',
    });

    expect(generated.match(/_Check_SchemaFirstCheckStorefrontResolver_product_args/g)).toHaveLength(
      3,
    );
  });

  it('writes the generated check file', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-resolver-checks-'));
    const out = join(outDir, 'graphql-resolver-checks.ts');

    const result = await generateSchemaFirstResolverChecks({
      schemaSdl,
      resolvers: [SchemaFirstCheckStorefrontResolver],
      tsconfig,
      out,
      gqlTypesImport: './graphql',
    });

    expect(result.changed).toBe(true);
    await expect(readFile(out, 'utf8')).resolves.toContain('Gql.Query.product.Result');
  });
});
