import { resolve } from 'node:path';

import { toJsonSchema } from '@valibot/to-json-schema';
import type { GenericSchema } from 'valibot';
import { describe, expect, it } from 'vitest';

import { GetUserInput, RenameUserInput } from './gql-args-sample.lib';
import { generateSdlForResolvers } from './graphql-sdl-generator.lib';
import { gqlValidated, Mutation, Query, ResolveField, Resolver } from './index';

function narrowToValibotSchema(value: unknown): GenericSchema;
function narrowToValibotSchema(value: unknown): unknown {
  return value;
}

const testSchemaAdapter = {
  toJsonSchema: (schema: unknown) => toJsonSchema(narrowToValibotSchema(schema)),
};

const testSchemaResolver = (modulePath: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ modulePath);

type UserPublic = {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'disabled';
};

@Resolver()
class UserResolver {
  @Query()
  user(): Promise<UserPublic | null> {
    return Promise.resolve({ id: '1', name: 'Ada', status: 'active' });
  }

  @Query()
  users(): UserPublic[] {
    return [];
  }

  @Mutation()
  createUser(): UserPublic {
    return { id: '2', name: 'Grace', status: 'active' };
  }

  @ResolveField()
  posts(_parent: UserPublic): string[] {
    return [];
  }
}

@Resolver()
class ArgsUserResolver {
  @Query()
  userById(input = gqlValidated(GetUserInput)): Promise<UserPublic | null> {
    return Promise.resolve({ id: input.id, name: 'Ada', status: 'active' });
  }

  @Mutation()
  renameUser(input = gqlValidated(RenameUserInput)): UserPublic {
    return { id: input.id, name: input.name, status: 'active' };
  }
}

describe('generateSdlForResolvers', () => {
  it('emits SDL from resolver return types and merges field resolvers', async () => {
    const sdl = await generateSdlForResolvers([UserResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });

    expect(sdl).toContain(`type Query {
  user: UserPublic
  users: [UserPublic!]!
}`);
    expect(sdl).toContain(`type Mutation {
  createUser: UserPublic!
}`);
    expect(sdl).toContain(`type UserPublic {
  id: String!
  name: String!
  status: UserPublicStatus!
  posts: [String!]!
}`);
    expect(sdl).toContain(`enum UserPublicStatus {
  ACTIVE
  DISABLED
}`);
  });

  it('emits field args from gqlValidated schema top-level properties', async () => {
    const sdl = await generateSdlForResolvers([ArgsUserResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
      schemaAdapter: testSchemaAdapter,
      schemaResolver: testSchemaResolver,
    });

    expect(sdl).toContain(`type Query {
  userById(id: String!): UserPublic
}`);
    expect(sdl).toContain(`type Mutation {
  renameUser(id: String!, name: String!, priority: Int): UserPublic!
}`);
  });

  it('fails the build when gqlValidated is used without a schemaAdapter', async () => {
    await expect(
      generateSdlForResolvers([ArgsUserResolver], {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      }),
    ).rejects.toThrow(/schemaAdapter/);
  });
});
