import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { gqlValidated, runWithGraphqlArgs } from './gql-validated.lib';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import { executeGraphqlRequest } from './graphql-runtime.lib';
import { Query, Resolver } from './index';

const GetUserInput = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});

describe('gqlValidated', () => {
  it('returns validated args inside a GraphQL args context', () => {
    const output = runWithGraphqlArgs({ id: 'user-1' }, () => gqlValidated(GetUserInput));

    expect(output).toEqual({ id: 'user-1' });
  });

  it('throws a validation error when args do not match the schema', () => {
    expect(() => runWithGraphqlArgs({ id: '' }, () => gqlValidated(GetUserInput))).toThrow(
      /validation failed/i,
    );
  });

  it('throws when called outside a GraphQL args context', () => {
    expect(() => gqlValidated(GetUserInput)).toThrow(/args context/i);
  });
});

type UserPublic = {
  readonly id: string;
  readonly name: string;
};

@Resolver()
class ArgsUserResolver {
  @Query()
  user(input = gqlValidated(GetUserInput)): UserPublic {
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
  it('passes GraphQL field args to gqlValidated in the resolver', async () => {
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
});
