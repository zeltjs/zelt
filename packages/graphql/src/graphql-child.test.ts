import type { ServiceResolver, ZeltPrebuilt } from '@zeltjs/core';
import { createApp, http } from '@zeltjs/core';
import { getClassMetadata } from '@zeltjs/decorator-metadata';
import { describe, expect, it } from 'vitest';

import type { GraphqlResolverClass } from './graphql-metadata.lib';
import { getGraphqlControllerMetadata, getResolverMetadata } from './graphql-metadata.lib';
import { graphql, Mutation, Query, ResolveField, Resolver } from './index';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';

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

const createServiceResolver = (
  prebuilt: ZeltPrebuilt | undefined,
  instances: ReadonlyMap<object, object> = new Map(),
): ServiceResolver => ({
  get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => {
    const instance = instances.get(cls);
    return (instance ?? new cls()) as T;
  },
  registerShutdown: (callback) => async () => callback(),
  prebuilt,
});

describe('graphql HTTP child helper', () => {
  it('returns an HTTP-mountable feature module with a GraphQL controller', () => {
    const child = graphql({ path: '/graphql', resolvers: [UserResolver] });

    expect(child.path).toBe('/graphql');
    expect(child.blueprint().getControllers()).toHaveLength(1);

    const controller = child.blueprint().getControllers()[0];
    expect(controller).toBeDefined();
    if (!controller) throw new Error('missing controller');

    const controllerMetadata = getClassMetadata(controller);
    expect(controllerMetadata?.props).toContainEqual({
      decorator: 'Controller',
      basePath: '/',
    });

    expect(getGraphqlControllerMetadata(controller)).toEqual({
      key: 'graphql',
      path: '/graphql',
      resolvers: [UserResolver],
    });
  });

  it('uses the explicit `name` as the key instead of the default', () => {
    const child = graphql({ path: '/graphql', resolvers: [UserResolver], name: 'storefront' });
    const controller = child.blueprint().getControllers()[0];
    if (!controller) throw new Error('missing controller');

    expect(getGraphqlControllerMetadata(controller)).toEqual({
      key: 'storefront',
      path: '/graphql',
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

describe('graphql realize() prebuilt requirements', () => {
  it('throws when the runtime resolver has no prebuilt module', async () => {
    const child = graphql({ path: '/graphql', resolvers: [UserResolver] });

    await expect(child.realize(createServiceResolver(undefined))).rejects.toThrow(
      /requires a prebuilt module/i,
    );
  });

  it('throws when the prebuilt module has no entry for this key', async () => {
    const child = graphql({ path: '/graphql', resolvers: [UserResolver] });
    const prebuilt: ZeltPrebuilt = { version: 1, features: { graphql: {} } };

    await expect(child.realize(createServiceResolver(prebuilt))).rejects.toThrow(
      /no graphql prebuilt entry for key "graphql"/i,
    );
  });

  it('throws when the prebuilt entry hash no longer matches the resolvers', async () => {
    const child = graphql({ path: '/graphql', resolvers: [UserResolver] });
    const prebuilt: ZeltPrebuilt = {
      version: 1,
      features: {
        graphql: {
          graphql: {
            runtime: {
              schemaSdl: `type Query {\n  user: UserPublic\n}\n\ntype UserPublic {\n  id: String!\n}\n`,
              bindings: { Query: { user: { resolver: 'UserResolver', method: 'user' } } },
            },
            resolversHash: 'stale-hash',
          },
        },
      },
    };

    await expect(child.realize(createServiceResolver(prebuilt))).rejects.toThrow(/stale/i);
  });

  it('executes requests using the prebuilt runtime when the key matches', async () => {
    const resolversHash = await computeGraphqlPrebuiltHash('/graphql', [UserResolver]);
    const prebuilt: ZeltPrebuilt = {
      version: 1,
      features: {
        graphql: {
          graphql: {
            runtime: {
              schemaSdl: `type Query {\n  user: UserPublic\n}\n\ntype UserPublic {\n  id: String!\n  name: String!\n}\n`,
              bindings: { Query: { user: { resolver: 'UserResolver', method: 'user' } } },
            },
            resolversHash,
          },
        },
      },
    };

    const app = createApp([
      http({
        controllers: [],
        children: [graphql({ path: '/graphql', resolvers: [UserResolver] })],
      }),
    ]);
    const running = await app.createRuntime({ prebuilt });
    const response = await running.http.request('/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ user { id name } }' }),
    });

    await expect(response.json()).resolves.toEqual({
      data: { user: { id: '1', name: 'Ada' } },
    });
  });

  it('looks up the prebuilt entry under the explicit `name` when one is given', async () => {
    const resolversHash = await computeGraphqlPrebuiltHash('/graphql', [UserResolver]);
    const prebuilt: ZeltPrebuilt = {
      version: 1,
      features: {
        graphql: {
          storefront: {
            runtime: {
              schemaSdl: `type Query {\n  user: UserPublic\n}\n\ntype UserPublic {\n  id: String!\n}\n`,
              bindings: { Query: { user: { resolver: 'UserResolver', method: 'user' } } },
            },
            resolversHash,
          },
        },
      },
    };

    const app = createApp([
      http({
        controllers: [],
        children: [graphql({ path: '/graphql', resolvers: [UserResolver], name: 'storefront' })],
      }),
    ]);
    const running = await app.createRuntime({ prebuilt });
    const response = await running.http.request('/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ user { id } }' }),
    });

    await expect(response.json()).resolves.toEqual({ data: { user: { id: '1' } } });
  });
});
