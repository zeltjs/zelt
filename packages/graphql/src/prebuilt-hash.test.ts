import { describe, expect, it } from 'vitest';
import type { GraphqlResolverClass } from './graphql-metadata.lib';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';

class ResolverA {}
class ResolverB {}

describe('computeGraphqlPrebuiltHash', () => {
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
