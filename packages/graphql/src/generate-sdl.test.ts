import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateSdlForResolvers } from './graphql-sdl-generator.lib';
import { Mutation, Query, ResolveField, Resolver } from './index';

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
});
