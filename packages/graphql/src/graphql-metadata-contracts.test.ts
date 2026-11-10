import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import { Query, Relation, ResolveField, ResolveMultiField, Resolver } from './index';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';
import { renderSchemaFirstResolverChecks } from './schema-first-resolver-checks.lib';
import { generateSchemaFirstGraphqlRuntimeForResolvers } from './schema-first-runtime.lib';

type ContractUser = { id: string; name: string };
@Resolver()
class RequiredArgumentResolver {
  @Query()
  user(id: string): Pick<ContractUser, 'id'> {
    return { id };
  }
  @ResolveMultiField()
  load(_ref: Pick<ContractUser, 'id'>): ContractUser | null {
    return null;
  }
}
@Resolver()
class MixedOperationsResolver {
  @Relation()
  @ResolveField()
  name(_parent: Pick<ContractUser, 'id'>): string {
    return 'name';
  }
}
@Resolver()
class UndeclaredRelationResolver {
  @Relation()
  friend(_parent: Pick<ContractUser, 'id'>): Pick<ContractUser, 'id'> | null {
    return null;
  }
}
const stackedQueries = (first: string, second: string) => {
  @Resolver()
  class StackedResolver {
    @Query(first)
    @Query(second)
    value(): string {
      return 'value';
    }
  }
  return StackedResolver;
};

describe('GraphQL metadata contracts', () => {
  const tsconfig = resolve(__dirname, '../tsconfig.json');
  it('rejects required positional arguments on model queries', async () => {
    await expect(
      generateGraphqlRuntimeForResolvers([RequiredArgumentResolver], { tsconfig }),
    ).rejects.toThrow('query parameters require defaults');
  });
  it('rejects a relation whose field is not declared in the model', async () => {
    await expect(
      generateGraphqlRuntimeForResolvers([UndeclaredRelationResolver], { tsconfig }),
    ).rejects.toThrow('field ContractUser.friend must be declared in ContractUser');
  });
  it('fingerprints operation order within one method', async () => {
    expect(
      await computeGraphqlPrebuiltHash('/graphql', [stackedQueries('first', 'second')]),
    ).not.toBe(await computeGraphqlPrebuiltHash('/graphql', [stackedQueries('second', 'first')]));
  });
  it('rejects model-only decorators even after a supported decorator', async () => {
    const schemaSdl = 'type Query { name: String }';
    await expect(
      generateSchemaFirstGraphqlRuntimeForResolvers([MixedOperationsResolver], {
        schemaSdl,
        tsconfig,
      }),
    ).rejects.toThrow('Schema-first does not support @Relation()');
    await expect(
      renderSchemaFirstResolverChecks({
        schemaSdl,
        resolvers: [MixedOperationsResolver],
        tsconfig,
        out: resolve(__dirname, 'generated/graphql-resolver-checks.ts'),
        gqlTypesImport: './graphql',
      }),
    ).rejects.toThrow('Schema-first does not support @Relation()');
  });
  it('requires an own binding for prototype-named root fields', async () => {
    await expect(
      generateSchemaFirstGraphqlRuntimeForResolvers([], {
        schemaSdl: 'type Query { toString: String constructor: String }',
        tsconfig,
      }),
    ).rejects.toThrow('Schema-first resolver binding missing for Query.toString');
  });
});
