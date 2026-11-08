import { resolve } from 'node:path';
import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import { Query, Relation, ResolveField, Resolver } from './index';

type Friends = readonly EquivalentUser[];
type Friend = EquivalentUser;
type EquivalentUser = {
  id: string;
  friends: Friends;
  friend: Friend | undefined;
  optionalFriend?: Friend;
  label: string | null;
  nickname?: string;
  absent?: string;
};
@Resolver()
class EquivalentUsers {
  @Query()
  user(): Pick<EquivalentUser, 'id'> {
    return { id: 'one' };
  }
  @Relation()
  friends(parent: Pick<EquivalentUser, 'id'>): readonly Pick<EquivalentUser, 'id'>[] {
    return [parent];
  }
  @Relation()
  friend(parent: Pick<EquivalentUser, 'id'>): Pick<EquivalentUser, 'id'> | null {
    return parent;
  }
  @Relation()
  optionalFriend(parent: Pick<EquivalentUser, 'id'>): Pick<EquivalentUser, 'id'> | null {
    return parent;
  }
  @ResolveField()
  nickname(parent: Pick<EquivalentUser, 'id'>): string {
    return parent.id;
  }
  @ResolveField()
  absent(_parent: Pick<EquivalentUser, 'id'>): undefined {
    return undefined;
  }
  @ResolveField()
  label(_parent: Pick<EquivalentUser, 'id'>): 'active' {
    return 'active';
  }
}

class ClassUser {
  readonly id: string = '';
  readonly name: string = '';
}
@Resolver()
class ClassUsers {
  @Query()
  user(): Pick<ClassUser, 'id'> {
    return { id: 'one' };
  }
  @ResolveField()
  name(parent: Pick<ClassUser, 'id'>): string {
    return parent.id;
  }
}

type LiteralUser = { id: string; status: 'active' };
@Resolver()
class InvalidLiteralUsers {
  @Query()
  user(): Pick<LiteralUser, 'id'> {
    return { id: 'one' };
  }
  @ResolveField()
  status(_parent: Pick<LiteralUser, 'id'>): string {
    return 'inactive';
  }
}

namespace Declared {
  export type User = { id: string; name: string };
}
namespace Returned {
  export type User = { id: string; name: string };
}
type Owner = { id: string; friend: Declared.User };
@Resolver()
class Owners {
  @Query()
  owner(): Pick<Owner, 'id'> {
    return { id: 'owner' };
  }
  @Relation()
  friend(_parent: Pick<Owner, 'id'>): Pick<Returned.User, 'id'> {
    return { id: 'friend' };
  }
}
@Resolver()
class ReturnedUsers {
  @ResolveField()
  name(parent: Pick<Returned.User, 'id'>): string {
    return parent.id;
  }
}

type ReadonlyUser = Readonly<{ id: string; friend?: ReadonlyUser }>;
@Resolver()
class ReadonlyUsers {
  @Query()
  user(): Pick<ReadonlyUser, 'id'> {
    return { id: 'one' };
  }
  @Relation()
  friend(parent: Pick<ReadonlyUser, 'id'>): Pick<ReadonlyUser, 'id'> | null {
    return parent;
  }
}

describe('declared model type contracts', () => {
  const options = { tsconfig: resolve(__dirname, '../tsconfig.json') };
  it('resolves aliases and undefined using declared types, preserving declared nullability', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([EquivalentUsers], options);
    const type = buildSchema(runtime.schemaSdl).getType('EquivalentUser');
    expect(String(type)).toBe('EquivalentUser');
    expect(runtime.schemaSdl).toContain('friends: [EquivalentUser!]!');
    expect(runtime.schemaSdl).toMatch(/\n {2}friend: EquivalentUser\n/);
    expect(runtime.schemaSdl).toMatch(/\n {2}optionalFriend: EquivalentUser\n/);
    expect(runtime.schemaSdl).toMatch(/\n {2}label: String\n/);
    expect(runtime.schemaSdl).toMatch(/\n {2}nickname: String\n/);
    expect(runtime.schemaSdl).toMatch(/\n {2}absent: String\n/);
  });
  it('preserves model identity through a mapped type', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([ReadonlyUsers], options);
    expect(runtime.schemaSdl).toMatch(/\n {2}friend: ReadonlyUser\n/);
  });
  it('uses class property types', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([ClassUsers], options);
    expect(runtime.schemaSdl).toContain('name: String!');
  });
  it('rejects a wider return type before converting types to GraphQL scalars', async () => {
    await expect(
      generateGraphqlRuntimeForResolvers([InvalidLiteralUsers], options),
    ).rejects.toThrow('resolved field type must match LiteralUser.status');
  });
  it('rejects a different model with the same name and structure', async () => {
    await expect(
      generateGraphqlRuntimeForResolvers([Owners, ReturnedUsers], options),
    ).rejects.toThrow('relation target differs from the declared model type');
  });
});
