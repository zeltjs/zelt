import { getClassMetadata } from '@zeltjs/decorator-metadata';
import { describe, expect, it } from 'vitest';

import type { GraphqlResolverClass } from './graphql-metadata.lib';
import {
  getGraphqlControllerMetadata,
  getResolverMetadata,
  graphql,
  Mutation,
  Query,
  ResolveField,
  Resolver,
} from './index';

type UserPublic = {
  readonly id: string;
  readonly name: string;
};

@Resolver()
class UserResolver {
  @Query()
  user(): UserPublic {
    return { id: '1', name: 'Ada' };
  }

  @Mutation()
  createUser(): UserPublic {
    return { id: '2', name: 'Grace' };
  }

  @ResolveField()
  posts(_parent: UserPublic): readonly string[] {
    return [];
  }
}

describe('graphql HTTP child helper', () => {
  it('returns an HTTP-mountable feature module with a GraphQL controller', () => {
    const child = graphql({ path: '/graphql', resolvers: [UserResolver] });

    expect(child.path).toBe('/graphql');
    expect(child.staticCapabilities().getControllers()).toHaveLength(1);

    const controller = child.staticCapabilities().getControllers()[0];
    expect(controller).toBeDefined();
    if (!controller) throw new Error('missing controller');

    const controllerMetadata = getClassMetadata(controller);
    expect(controllerMetadata?.props).toContainEqual({
      decorator: 'Controller',
      basePath: '/',
    });

    expect(getGraphqlControllerMetadata(controller)).toEqual({
      resolvers: [UserResolver],
    });
  });
});

describe('resolver name collision detection', () => {
  it('throws when two resolver classes share the same name', () => {
    const makeResolver = (name: string): GraphqlResolverClass => {
      @Resolver()
      class DynamicResolver {
        @Query()
        dummy(): string {
          return '';
        }
      }
      Object.defineProperty(DynamicResolver, 'name', { value: name });
      return DynamicResolver;
    };

    const resolverA = makeResolver('DuplicateName');
    const resolverB = makeResolver('DuplicateName');

    expect(() => graphql({ path: '/graphql', resolvers: [resolverA, resolverB] })).toThrow(
      /duplicate.*resolver.*DuplicateName/i,
    );
  });
});

describe('GraphQL resolver decorators', () => {
  it('records resolver and operation metadata', () => {
    expect(getResolverMetadata(UserResolver)).toEqual({ kind: 'resolver' });

    const meta = getClassMetadata(UserResolver);
    expect(meta?.methods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'user',
          props: expect.arrayContaining([{ kind: 'query' }]),
        }),
        expect.objectContaining({
          name: 'createUser',
          props: expect.arrayContaining([{ kind: 'mutation' }]),
        }),
        expect.objectContaining({
          name: 'posts',
          props: expect.arrayContaining([{ kind: 'resolveField' }]),
        }),
      ]),
    );
  });
});
