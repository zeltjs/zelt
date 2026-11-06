import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import { Query, Relation, ResolveField, ResolveMultiField, Resolver } from './index';

type ModelUser = {
  readonly id: string;
  readonly first: string;
  readonly $secret: { readonly token: string };
  readonly active: boolean | null;
  readonly optional?: boolean;
  readonly requiredUndefined: string | undefined;
  readonly both: string | null | undefined;
};
@Resolver()
class ModelUserResolver {
  @Query()
  user(): Pick<ModelUser, 'id'> {
    return { id: '1' };
  }
  @ResolveMultiField()
  users(_refs: readonly Pick<ModelUser, 'id'>[]): Map<ModelUser['id'], ModelUser | null> {
    return new Map();
  }
  @ResolveField()
  label(user: Pick<ModelUser, 'first' | '$secret'>): string {
    return user.first + user.$secret.token;
  }
  @Relation()
  friend(user: Pick<ModelUser, 'id'>): Pick<ModelUser, 'id'> | null {
    return user.id ? { id: user.id } : null;
  }
}

type BatchUser = { id: string; $friend: string };
const contextValue = (): string => 'context';
@Resolver()
class BatchUserResolver {
  @Query()
  list(): readonly (Pick<BatchUser, 'id'> | null)[] | null {
    return null;
  }
  @Query('batchUser')
  getUser(): Promise<Pick<BatchUser, 'id'> | null> {
    return Promise.resolve(null);
  }
  @ResolveMultiField()
  load(
    _refs: readonly Pick<BatchUser, 'id'>[],
    _context = contextValue(),
  ): Promise<ReadonlyMap<BatchUser['id'], BatchUser | null>> {
    return Promise.resolve(new Map());
  }
  @Relation('friends')
  getFriends(
    _users: readonly Pick<BatchUser, 'id'>[],
    _context = contextValue(),
  ): ReadonlyMap<BatchUser['id'], readonly Pick<BatchUser, 'id'>[]> {
    return new Map();
  }
}

type OtherUser = { id: string; $friend: string };
@Resolver()
class WrongParentResolver {
  @ResolveMultiField()
  load(_refs: readonly Pick<BatchUser, 'id'>[]): Map<BatchUser['id'], BatchUser | null> {
    return new Map();
  }
  @ResolveField()
  wrong(_user: Pick<OtherUser, 'id'>): string {
    return '';
  }
}

namespace Fake {
  export type Map<K, V> = globalThis.Map<K, V>;
}
@Resolver()
class FakeMapResolver {
  @ResolveMultiField()
  load(_refs: readonly Pick<BatchUser, 'id'>[]): Fake.Map<BatchUser['id'], BatchUser | null> {
    return new Map();
  }
}

namespace FakeArray {
  export type Array<T> = { value: T };
}
@Resolver()
class FakeArrayResolver {
  @ResolveMultiField()
  load(_refs: FakeArray.Array<Pick<BatchUser, 'id'>>): Map<BatchUser['id'], BatchUser | null> {
    return new Map();
  }
}
@Resolver()
class NamesResolver {
  @Query('constructor')
  another(): Pick<BatchUser, 'id'> {
    return { id: '2' };
  }
  @Query('toString')
  user(): Pick<BatchUser, 'id'> {
    return { id: '1' };
  }
  @ResolveMultiField()
  load(_refs: readonly Pick<BatchUser, 'id'>[]): Map<BatchUser['id'], BatchUser | null> {
    return new Map();
  }
}
@Resolver()
class ReservedResolver {
  @Query('__reserved')
  user(): Pick<BatchUser, 'id'> {
    return { id: '1' };
  }
  @ResolveMultiField()
  load(_refs: readonly Pick<BatchUser, 'id'>[]): Map<BatchUser['id'], BatchUser | null> {
    return new Map();
  }
}

type NumericId = { id: number };
@Resolver()
class NumericIdResolver {
  @ResolveMultiField()
  load(_refs: readonly Pick<NumericId, 'id'>[]): Map<NumericId['id'], NumericId | null> {
    return new Map();
  }
}

type BadUser = { id: string; $secret: string };
@Resolver()
class BadUserResolver {
  @ResolveMultiField()
  users(_refs: readonly Pick<BadUser, 'id'>[]): Map<BadUser['id'], BadUser | null> {
    return new Map();
  }
  @ResolveField()
  id(user: Pick<BadUser, 'id'>): string {
    return user.id;
  }
}

describe('model code generation', () => {
  it('generates public source fields and model bindings', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([ModelUserResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });
    expect(runtime.schemaSdl).toContain('friend: ModelUser');
    expect(runtime.schemaSdl).toContain('label: String!');
    expect(runtime.schemaSdl).toContain('active: Boolean');
    expect(runtime.schemaSdl).toContain('optional: Boolean');
    expect(runtime.schemaSdl).not.toContain('$secret');
    const model = runtime.models?.['ModelUser'];
    expect(model).toBeDefined();
    if (!model) throw new Error('Missing ModelUser model');
    expect(model.properties.find((p) => p.name === '$secret')?.value.kind).toBe('opaque');
    expect(model.properties.map((p) => p.name)).toContain('$secret');
    expect(runtime.modelFields?.['ModelUser']?.['friend']).toMatchObject({
      kind: 'relation',
      mode: 'single',
    });
  });
  it('distinguishes null and undefined in source metadata', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([ModelUserResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });
    expect(
      runtime.models?.['ModelUser']?.properties.find((p) => p.name === 'requiredUndefined')?.value,
    ).toEqual({ kind: 'optional', inner: { kind: 'scalar', name: 'string' } });
    expect(runtime.models?.['ModelUser']?.properties.find((p) => p.name === 'both')?.value).toEqual(
      { kind: 'optional', inner: { kind: 'nullable', inner: { kind: 'scalar', name: 'string' } } },
    );
  });
  it('supports aliases and batch relations independently of Promise', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([BatchUserResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });
    expect(runtime.schemaSdl).toContain('batchUser: BatchUser');
    expect(runtime.schemaSdl).toContain('friends: [BatchUser!]!');
    const fields = runtime.modelFields;
    expect(fields).toBeDefined();
    if (!fields) throw new Error('Missing model fields');
    expect(fields['Query']?.['list']).toMatchObject({
      shape: { kind: 'many', nullable: true, itemNullable: true },
    });
    expect(fields['Query']?.['batchUser']).toMatchObject({
      shape: { kind: 'one', nullable: true },
    });
    expect(runtime.bindings['BatchUser']?.['friends']?.method).toBe('getFriends');
    expect(fields['BatchUser']?.['friends']).toMatchObject({
      kind: 'relation',
      mode: 'batch',
    });
  });
  it('rejects another structurally identical parent model and a nonstandard Map', async () => {
    const options = { tsconfig: resolve(__dirname, '../tsconfig.json') };
    await expect(
      generateGraphqlRuntimeForResolvers([WrongParentResolver], options),
    ).rejects.toThrow('parent Pick must refer to provider model');
    await expect(generateGraphqlRuntimeForResolvers([FakeMapResolver], options)).rejects.toThrow(
      'provider must return Map',
    );
  });
  it('accepts prototype-named fields and rejects reserved names and fake arrays', async () => {
    const options = { tsconfig: resolve(__dirname, '../tsconfig.json') };
    const runtime = await generateGraphqlRuntimeForResolvers([NamesResolver], options);
    expect(Object.hasOwn(runtime.modelFields?.['Query'] ?? {}, 'toString')).toBe(true);
    expect(Object.hasOwn(runtime.modelFields?.['Query'] ?? {}, 'constructor')).toBe(true);
    await expect(generateGraphqlRuntimeForResolvers([ReservedResolver], options)).rejects.toThrow(
      'invalid GraphQL field name',
    );
    await expect(generateGraphqlRuntimeForResolvers([FakeArrayResolver], options)).rejects.toThrow(
      'expected a direct Pick',
    );
  });
  it('requires string model identifiers', async () => {
    await expect(
      generateGraphqlRuntimeForResolvers([NumericIdResolver], {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      }),
    ).rejects.toThrow('model requires a non-null scalar id');
  });
  it('rejects duplicate source and computed fields', async () => {
    await expect(
      generateGraphqlRuntimeForResolvers([BadUserResolver], {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      }),
    ).rejects.toThrow('duplicate field');
  });
});
