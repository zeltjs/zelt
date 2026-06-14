import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { args, readGraphqlArgs, runWithGraphqlArgs, validateGraphqlArgs } from './args.lib';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import { createGraphqlExecutor, executeGraphqlRequest } from './graphql-runtime.lib';
import { Query, Resolver } from './index';

const GetUserInput = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});

describe('args', () => {
  it('returns validated args inside a GraphQL args context', () => {
    const output = runWithGraphqlArgs({ id: 'user-1' }, () => args(GetUserInput));

    expect(output).toEqual({ id: 'user-1' });
  });

  it('throws a validation error when args do not match the schema', () => {
    expect(() => runWithGraphqlArgs({ id: '' }, () => args(GetUserInput))).toThrow(
      /validation failed/i,
    );
  });

  it('throws when called outside a GraphQL args context', () => {
    expect(() => args(GetUserInput)).toThrow(
      'args() requires a GraphQL args context; call it only as a resolver method default parameter.',
    );
  });

  it('throws a clear error for async validation schemas', () => {
    const AsyncInput = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({ value: { id: 'user-1' } }),
      },
    } as const;

    expect(() => runWithGraphqlArgs({ id: 'user-1' }, () => args(AsyncInput))).toThrow(
      'args() does not support async validation schemas.',
    );
  });

  it('lets generated helpers read raw GraphQL args from the current context', () => {
    const output = runWithGraphqlArgs({ id: 'product-1' }, () =>
      readGraphqlArgs<{ readonly id: string }>(),
    );

    expect(output.id).toBe('product-1');
  });

  it('lets generated helpers validate GraphQL args with Standard Schema', () => {
    const output = runWithGraphqlArgs({ id: 'product-1' }, () => validateGraphqlArgs(GetUserInput));

    expect(output).toEqual({ id: 'product-1' });
  });
});

type UserPublic = {
  readonly id: string;
  readonly name: string;
};

@Resolver()
class ArgsUserResolver {
  @Query()
  user(input = args(GetUserInput)): UserPublic {
    return { id: input.id, name: `name-${input.id}` };
  }
}

const runtime = {
  schemaSdl: `type Query {
  user(id: String!): UserPublic!
}

type UserPublic {
  id: String!
  name: String!
}
`,
  bindings: {
    Query: {
      user: { resolver: 'ArgsUserResolver', method: 'user' },
    },
  },
} satisfies GeneratedGraphqlRuntime;

describe('executeGraphqlRequest with field args', () => {
  it('passes GraphQL field args to args in the resolver', async () => {
    const result = await executeGraphqlRequest({
      runtime,
      resolvers: [ArgsUserResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ user(id: "user-7") { id name } }' },
    });

    expect(result).toEqual({
      data: {
        user: { id: 'user-7', name: 'name-user-7' },
      },
    });
  });

  it('surfaces validation failure as a GraphQL error', async () => {
    const result = await executeGraphqlRequest({
      runtime,
      resolvers: [ArgsUserResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ user(id: "") { id name } }' },
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toMatch(/validation failed/i);
  });

  it('exposes validation issues through GraphQL error extensions', async () => {
    const execute = createGraphqlExecutor({
      runtime,
      resolvers: [ArgsUserResolver],
      resolveResolver: (resolver) => new resolver() as object,
    });

    const ok = await execute({ query: '{ user(id: "user-1") { id } }' });
    expect(ok).toEqual({ data: { user: { id: 'user-1' } } });

    const failed = await execute({ query: '{ user(id: "") { id } }' });
    const extensions = failed.errors?.[0]?.extensions;
    expect(extensions?.['code']).toBe('GRAPHQL_ARGS_VALIDATION_FAILED');
    expect(Array.isArray(extensions?.['issues'])).toBe(true);
  });
});
