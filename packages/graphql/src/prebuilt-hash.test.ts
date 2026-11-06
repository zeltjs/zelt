import { describe, expect, it } from 'vitest';
import { Query, ResolveMultiField, Resolver } from './graphql.decorator';
import type { GraphqlResolverClass } from './graphql-metadata.lib';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';

class ResolverA {}
class ResolverB {}

const queryDeclaration = (fieldName: string) => {
  @Resolver()
  class NamedResolver {
    @Query(fieldName)
    value(): string {
      return 'value';
    }
  }
  return NamedResolver;
};

describe('computeGraphqlPrebuiltHash', () => {
  it('detects changed field names without changing the resolver class name', async () => {
    const first = queryDeclaration('first');
    const second = queryDeclaration('second');
    expect(first.name).toBe(second.name);
    expect(await computeGraphqlPrebuiltHash('/graphql', [first])).not.toBe(
      await computeGraphqlPrebuiltHash('/graphql', [second]),
    );
  });

  it('includes provider declarations in the startup fingerprint', async () => {
    @Resolver()
    class NamedResolver {
      @ResolveMultiField()
      value() {
        return new Map();
      }
    }
    const query = queryDeclaration('value');
    expect(query.name).toBe(NamedResolver.name);
    expect(await computeGraphqlPrebuiltHash('/graphql', [query])).not.toBe(
      await computeGraphqlPrebuiltHash('/graphql', [NamedResolver]),
    );
  });
  it('is deterministic for the same path and resolvers', async () => {
    const first = await computeGraphqlPrebuiltHash('/graphql', [
      ResolverA as GraphqlResolverClass,
      ResolverB as GraphqlResolverClass,
    ]);
    const second = await computeGraphqlPrebuiltHash('/graphql', [
      ResolverA as GraphqlResolverClass,
      ResolverB as GraphqlResolverClass,
    ]);

    expect(first).toBe(second);
  });

  it('is independent of resolver array order', async () => {
    const inOrder = await computeGraphqlPrebuiltHash('/graphql', [
      ResolverA as GraphqlResolverClass,
      ResolverB as GraphqlResolverClass,
    ]);
    const reversed = await computeGraphqlPrebuiltHash('/graphql', [
      ResolverB as GraphqlResolverClass,
      ResolverA as GraphqlResolverClass,
    ]);

    expect(inOrder).toBe(reversed);
  });

  it('changes when the path changes', async () => {
    const a = await computeGraphqlPrebuiltHash('/graphql', [ResolverA as GraphqlResolverClass]);
    const b = await computeGraphqlPrebuiltHash('/other', [ResolverA as GraphqlResolverClass]);

    expect(a).not.toBe(b);
  });

  it('changes when the resolver set changes', async () => {
    const a = await computeGraphqlPrebuiltHash('/graphql', [ResolverA as GraphqlResolverClass]);
    const b = await computeGraphqlPrebuiltHash('/graphql', [
      ResolverA as GraphqlResolverClass,
      ResolverB as GraphqlResolverClass,
    ]);

    expect(a).not.toBe(b);
  });
});
