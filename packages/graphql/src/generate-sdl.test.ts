import { resolve } from 'node:path';

import { toJsonSchema } from '@valibot/to-json-schema';
import type { GenericSchema } from 'valibot';
import { describe, expect, it } from 'vitest';

import { GetUserInput, RenameUserInput } from './gql-args-sample.lib';
import {
  generateGraphqlRuntimeForResolvers,
  generateSdlForResolvers,
} from './graphql-sdl-generator.lib';
import type { GqlOutput } from './index';
import { args, args as gqlArgs, gqlScalar, Mutation, Query, ResolveField, Resolver } from './index';

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
  userById(input = args(GetUserInput)): Promise<UserPublic | null> {
    return Promise.resolve({ id: input.id, name: 'Ada', status: 'active' });
  }

  @Mutation()
  renameUser(input = args(RenameUserInput)): UserPublic {
    return { id: input.id, name: input.name, status: 'active' };
  }
}

@Resolver()
class AliasedArgsUserResolver {
  @Query()
  userById(input = gqlArgs(GetUserInput)): Promise<UserPublic | null> {
    return Promise.resolve({ id: input.id, name: 'Ada', status: 'active' });
  }
}

@Resolver()
class BareNullResolver {
  @Query()
  nothing(): null {
    return null;
  }
}

type AccountState = 'active' | 'disabled';

@Resolver()
class EnumRootResolver {
  @Query()
  accountState(): AccountState {
    return 'active';
  }

  @Query()
  accountStates(): readonly AccountState[] {
    return ['active'];
  }
}

type MoneyValue = {
  readonly cents: number;
};

export const MoneyScalar = gqlScalar<MoneyValue>('Money', {
  serialize: (value) => value.cents,
});

type PricePublic = {
  readonly label: string;
  readonly amount: GqlOutput<typeof MoneyScalar>;
};

@Resolver()
class ScalarResolver {
  @Query()
  price(): PricePublic {
    return { label: 'subtotal', amount: { cents: 1299 } };
  }
}

type ProductSearchResult = {
  readonly productId: string;
  readonly name: string;
};

type CategorySearchResult = {
  readonly categoryId: string;
  readonly label: string;
};

type SearchResult = ProductSearchResult | CategorySearchResult;

@Resolver()
class SearchResolver {
  @Query()
  search(): readonly SearchResult[] {
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

  it('emits field args from args schema top-level properties', async () => {
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

  it('emits field args when args is imported with an alias', async () => {
    const sdl = await generateSdlForResolvers([AliasedArgsUserResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
      schemaAdapter: testSchemaAdapter,
      schemaResolver: testSchemaResolver,
    });

    expect(sdl).toContain(`type Query {
  userById(id: String!): UserPublic
}`);
  });

  it('records invocation hook keys for root fields with args schemas', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([ArgsUserResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
      schemaAdapter: testSchemaAdapter,
      schemaResolver: testSchemaResolver,
    });

    expect(runtime.bindings['Query']?.['userById']).toEqual({
      resolver: 'ArgsUserResolver',
      method: 'userById',
      hook: 'Query.userById',
    });
    expect(runtime.bindings['Mutation']?.['renameUser']).toEqual({
      resolver: 'ArgsUserResolver',
      method: 'renameUser',
      hook: 'Mutation.renameUser',
    });
  });

  it('records runtime enum mappings for root fields returning string literal unions', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([EnumRootResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });

    expect(runtime.schemaSdl).toContain(`type Query {
  accountState: AccountState!
  accountStates: [AccountState!]!
}`);
    expect(runtime.enumFields?.['Query']).toEqual({
      accountState: { active: 'ACTIVE', disabled: 'DISABLED' },
      accountStates: { active: 'ACTIVE', disabled: 'DISABLED' },
    });
  });

  it('emits custom scalar SDL and runtime refs from GqlOutput scalar fields', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([ScalarResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });

    expect(runtime.schemaSdl).toContain('scalar Money');
    expect(runtime.schemaSdl).toContain(`type Query {
  price: PricePublic!
}`);
    expect(runtime.schemaSdl).toContain(`type PricePublic {
  label: String!
  amount: Money!
}`);
    expect(runtime.scalarRefs).toEqual({
      Money: { modulePath: __filename, exportName: 'MoneyScalar' },
    });
    expect(runtime.scalars?.['Money']?.codec.serialize).toBe(MoneyScalar.codec.serialize);
  });

  it('emits named object union SDL and runtime member fields', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([SearchResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });

    expect(runtime.schemaSdl).toContain(`type Query {
  search: [SearchResult!]!
}`);
    expect(runtime.schemaSdl).toContain(
      'union SearchResult = ProductSearchResult | CategorySearchResult',
    );
    expect(runtime.schemaSdl).toContain(`type ProductSearchResult {
  productId: String!
  name: String!
}`);
    expect(runtime.schemaSdl).toContain(`type CategorySearchResult {
  categoryId: String!
  label: String!
}`);
    expect(runtime.unions).toEqual({
      SearchResult: {
        ProductSearchResult: ['productId', 'name'],
        CategorySearchResult: ['categoryId', 'label'],
      },
    });
  });

  it('fails the build for bare null return types instead of guessing String', async () => {
    await expect(
      generateSdlForResolvers([BareNullResolver], {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      }),
    ).rejects.toThrow(/null/i);
  });

  it('fails the build when args is used without a schemaAdapter', async () => {
    await expect(
      generateSdlForResolvers([ArgsUserResolver], {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      }),
    ).rejects.toThrow('args() requires the schemaAdapter option: ArgsUserResolver.userById');
  });

  it('fails the build when @ResolveField method has no parent parameter', async () => {
    @Resolver()
    class OrphanFieldResolver {
      @ResolveField()
      orphan(): string {
        return '';
      }
    }

    await expect(
      generateSdlForResolvers([OrphanFieldResolver], {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      }),
    ).rejects.toThrow(/parent type/i);
  });
});
