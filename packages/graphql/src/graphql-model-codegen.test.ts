import { resolve } from 'node:path';
import * as inspection from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it, vi } from 'vitest';
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

type VariantUser = { id: string; first: string };
@Resolver()
class SingleVariantResolver {
  @Query()
  variant(): Pick<VariantUser, 'id'> {
    return { id: '1' };
  }
  @ResolveMultiField()
  load(_ref: Pick<VariantUser, 'id'>): Promise<VariantUser | null> {
    return Promise.resolve(null);
  }
  @ResolveField()
  upper(user: Pick<VariantUser, 'first'>): Promise<string> {
    return Promise.resolve(user.first);
  }
  @Relation()
  other(user: Pick<VariantUser, 'id'>): Promise<Pick<VariantUser, 'id'> | null> {
    return Promise.resolve(user);
  }
}
@Resolver()
class SingleSyncVariantResolver {
  @ResolveMultiField()
  load(_ref: Pick<VariantUser, 'id'>): VariantUser | null {
    return null;
  }
  @ResolveField()
  upper(user: Pick<VariantUser, 'first'>): string {
    return user.first;
  }
  @Relation()
  other(user: Pick<VariantUser, 'id'>): Pick<VariantUser, 'id'> {
    return user;
  }
}
@Resolver()
class BatchVariantResolver {
  @Query()
  variant(): Pick<VariantUser, 'id'> {
    return { id: '1' };
  }
  @ResolveMultiField()
  load(_refs: readonly Pick<VariantUser, 'id'>[]): ReadonlyMap<string, VariantUser | null> {
    return new Map();
  }
  @ResolveField()
  upper(
    _users: readonly Pick<VariantUser, 'id' | 'first'>[],
  ): Promise<ReadonlyMap<string, readonly (string | null)[]>> {
    return Promise.resolve(new Map());
  }
  @ResolveField()
  lower(_users: readonly Pick<VariantUser, 'id'>[]): ReadonlyMap<string, string> {
    return new Map();
  }
  @Relation()
  other(
    _users: readonly Pick<VariantUser, 'id'>[],
  ): Promise<ReadonlyMap<string, Pick<VariantUser, 'id'> | null>> {
    return Promise.resolve(new Map());
  }
}
@Resolver()
class MissingBatchIdResolver {
  @ResolveMultiField()
  load(_refs: readonly Pick<VariantUser, 'id'>[]): Map<string, VariantUser | null> {
    return new Map();
  }
  @ResolveField()
  upper(_users: readonly Pick<VariantUser, 'first'>[]): Map<string, string> {
    return new Map();
  }
}
@Resolver()
class MissingRelationIdResolver {
  @ResolveMultiField()
  load(_ref: Pick<VariantUser, 'id'>): VariantUser | null {
    return null;
  }
  @Relation()
  other(_users: readonly Pick<VariantUser, 'first'>[]): Map<string, Pick<VariantUser, 'id'>> {
    return new Map();
  }
}
@Resolver()
class BadProviderShapeResolver {
  @ResolveMultiField()
  load(_ref: Pick<VariantUser, 'id'>): Map<string, VariantUser | null> {
    return new Map();
  }
}
@Resolver()
class BadComputedMapResolver {
  @ResolveMultiField()
  load(_refs: readonly Pick<VariantUser, 'id'>[]): Map<string, VariantUser | null> {
    return new Map();
  }
  @ResolveField()
  upper(_users: readonly Pick<VariantUser, 'id'>[]): Map<number, string> {
    return new Map();
  }
}
@Resolver()
class BadComputedValueResolver {
  @ResolveMultiField()
  load(_ref: Pick<VariantUser, 'id'>): VariantUser | null {
    return null;
  }
  @ResolveField()
  upper(_users: readonly Pick<VariantUser, 'id'>[]): Map<string, Promise<string>> {
    return new Map();
  }
}

@Resolver()
class BadRelationPromiseResolver {
  @ResolveMultiField()
  load(_ref: Pick<VariantUser, 'id'>): VariantUser | null {
    return null;
  }
  @Relation()
  other(_users: readonly Pick<VariantUser, 'id'>[]): Map<string, Promise<Pick<VariantUser, 'id'>>> {
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
  it('finishes the cold first inspection before inspecting the remaining models', async () => {
    const tsconfig = resolve(__dirname, '../tsconfig.json');
    inspection.clearProgramCache(tsconfig);
    const original = inspection.getTypeMetadata;
    let started = 0;
    let firstFinished = false;
    const warmed: boolean[] = [];
    const spy = vi.spyOn(inspection, 'getTypeMetadata').mockImplementation((...args) => {
      const index = started++;
      if (index > 0) warmed.push(firstFinished);
      return original(...args).map((metadata) => {
        if (index === 0) firstFinished = true;
        return metadata;
      });
    });
    try {
      const runtime = await generateGraphqlRuntimeForResolvers(
        [ModelUserResolver, BatchUserResolver, SingleVariantResolver],
        { tsconfig },
      );
      expect(Object.keys(runtime.models ?? {})).toHaveLength(3);
      expect(warmed).toEqual([true, true]);
    } finally {
      spy.mockRestore();
      inspection.clearProgramCache(tsconfig);
    }
  });
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
  it('generates single parent async and sync methods', async () => {
    const options = { tsconfig: resolve(__dirname, '../tsconfig.json') };
    const single = await generateGraphqlRuntimeForResolvers([SingleVariantResolver], options);
    const sync = await generateGraphqlRuntimeForResolvers([SingleSyncVariantResolver], options);
    expect(sync.models?.['VariantUser']?.mode).toBe('single');
    expect(single.models?.['VariantUser']?.mode).toBe('single');
    const fields = single.modelFields?.['VariantUser'];
    expect(fields).toBeDefined();
    if (!fields) throw new Error('Missing fields');
    expect(fields['upper']).toMatchObject({
      mode: 'single',
      value: { kind: 'scalar', name: 'string' },
    });
    expect(fields['other']).toMatchObject({ mode: 'single' });
  });
  it('generates one-parent values for batch computed methods', async () => {
    const batch = await generateGraphqlRuntimeForResolvers([BatchVariantResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });
    expect(batch.models?.['VariantUser']?.mode).toBe('batch');
    expect(batch.schemaSdl).toContain('upper: [String]!');
    const fields = batch.modelFields?.['VariantUser'];
    expect(fields).toBeDefined();
    if (!fields) throw new Error('Missing fields');
    expect(fields['lower']).toMatchObject({ mode: 'batch' });
    expect(fields['upper']).toMatchObject({
      mode: 'batch',
      value: { kind: 'array', item: { kind: 'nullable' } },
    });
    expect(fields['other']).toMatchObject({ mode: 'batch' });
  });
  it('rejects missing batch IDs, incorrect keys and nested promises', async () => {
    const options = { tsconfig: resolve(__dirname, '../tsconfig.json') };
    await expect(
      generateGraphqlRuntimeForResolvers([MissingBatchIdResolver], options),
    ).rejects.toThrow('batch parent Pick requires id');
    await expect(
      generateGraphqlRuntimeForResolvers([MissingRelationIdResolver], options),
    ).rejects.toThrow('batch parent Pick requires id');
    await expect(
      generateGraphqlRuntimeForResolvers([BadProviderShapeResolver], options),
    ).rejects.toThrow('provider result must be Model | null');
    await expect(
      generateGraphqlRuntimeForResolvers([BadComputedMapResolver], options),
    ).rejects.toThrow('Map key must match');
    await expect(
      generateGraphqlRuntimeForResolvers([BadComputedValueResolver], options),
    ).rejects.toThrow('batch Map values cannot be Promise');
    await expect(
      generateGraphqlRuntimeForResolvers([BadRelationPromiseResolver], options),
    ).rejects.toThrow('batch Map values cannot be Promise');
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
