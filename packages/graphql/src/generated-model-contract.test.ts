import { resolve } from 'node:path';
import { createApp, http, Injectable, inject } from '@zeltjs/core';
import * as v from 'valibot';
import { beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import type {
  GeneratedPost,
  GeneratedUser,
  Label,
  PostId,
  Score,
  UserId,
} from './generated-model.types';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import type { ID } from './index';
import { graphql, Query, Relation, ResolveField, ResolveMultiField, Resolver } from './index';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';

const userId = 'u1' as UserId;
const postId = v.parse(v.pipe(v.string(), v.brand('PostId')), 'p1');
const score = v.parse(v.pipe(v.number(), v.brand('Score')), 1);
const label = 'Ada' as Label;

declare module './generated-model.types' {
  interface GeneratedUser {
    readonly displayName: string;
    readonly initials: string;
    readonly hasPassword: boolean;
    readonly brandedNames: readonly (Label | null)[] | null;
  }
  interface GeneratedPost {
    readonly createdAt: string;
    readonly brandedScore: Score | null;
    readonly scoresById: readonly Score[];
  }
}
type Call = { readonly method: string; readonly ids: readonly string[] };
const calls: Call[] = [];

@Injectable()
class Database {
  readonly firstName = label;
  readonly createdAt = new Date('2026-01-02T00:00:00.000Z');
}
@Injectable()
class Suffix {
  readonly value = '!';
}

abstract class GeneratedUserResolver {
  protected readonly db = inject(Database);

  @ResolveMultiField()
  columns(
    refs: readonly Pick<GeneratedUser, 'id'>[],
  ): ReadonlyMap<
    GeneratedUser['id'],
    Pick<GeneratedUser, 'firstName' | 'aliases' | '$passwordHash'>
  > {
    calls.push({ method: 'users', ids: refs.map(({ id }) => id) });
    return new Map(
      refs.map(({ id }) => [
        id,
        {
          firstName: this.db.firstName,
          aliases: [this.db.firstName, null],
          $passwordHash: 'hash',
        },
      ]),
    );
  }

  @Relation()
  posts(
    refs: readonly Pick<GeneratedUser, 'id'>[],
  ): ReadonlyMap<GeneratedUser['id'], readonly Pick<GeneratedPost, 'id'>[]> {
    calls.push({ method: 'postsRelation', ids: refs.map(({ id }) => id) });
    return new Map(refs.map(({ id }) => [id, [{ id: postId }]]));
  }

  @ResolveField()
  hasPassword(user: Pick<GeneratedUser, '$passwordHash'>): boolean {
    return user.$passwordHash.length > 0;
  }
}

@Resolver()
class UserResolver extends GeneratedUserResolver {
  constructor(private readonly suffix = inject(Suffix)) {
    super();
  }

  @Query()
  users(): readonly Pick<GeneratedUser, 'id'>[] {
    return [{ id: userId }, { id: userId }];
  }

  @ResolveField()
  displayName(user: Pick<GeneratedUser, 'firstName'>): string {
    return `${user.firstName}${this.suffix.value}`;
  }

  @ResolveField()
  initials(user: Pick<GeneratedUser, 'displayName'>): string {
    return user.displayName.slice(0, 1);
  }

  @ResolveField()
  brandedNames(user: Pick<GeneratedUser, 'firstName'>): readonly (Label | null)[] | null {
    return [user.firstName, null];
  }
}

abstract class GeneratedPostResolver {
  protected readonly db = inject(Database);

  @ResolveMultiField()
  columns(
    refs: readonly Pick<GeneratedPost, 'id'>[],
  ): ReadonlyMap<
    GeneratedPost['id'],
    Pick<GeneratedPost, 'score' | 'scores' | '$createdAt' | '$authorId'>
  > {
    calls.push({ method: 'posts', ids: refs.map(({ id }) => id) });
    return new Map(
      refs.map(({ id }) => [
        id,
        {
          score,
          scores: [score],
          $createdAt: this.db.createdAt,
          $authorId: userId,
        },
      ]),
    );
  }

  @Relation()
  author(post: Pick<GeneratedPost, '$authorId'>): Pick<GeneratedUser, 'id'> {
    return { id: post.$authorId };
  }
}

@Resolver()
class PostResolver extends GeneratedPostResolver {
  @Query()
  posts(): readonly Pick<GeneratedPost, 'id'>[] {
    return [{ id: postId }, { id: postId }];
  }

  @ResolveField()
  createdAt(post: Pick<GeneratedPost, '$createdAt'>): string {
    return post.$createdAt.toISOString();
  }

  @ResolveField()
  brandedScore(post: Pick<GeneratedPost, 'score'>): Score | null {
    return post.score;
  }

  @ResolveField()
  scoresById(
    posts: readonly Pick<GeneratedPost, 'id'>[],
  ): ReadonlyMap<GeneratedPost['id'], readonly Score[]> {
    calls.push({ method: 'scoresById', ids: posts.map(({ id }) => id) });
    return new Map(posts.map(({ id }) => [id, [score]]));
  }
}

@Resolver()
class DuplicateColumnResolver extends GeneratedUserResolver {
  @ResolveField()
  firstName(_user: Pick<GeneratedUser, 'id'>): Label {
    return label;
  }
}

@Resolver()
class WrongMapKeyResolver {
  @ResolveField()
  broken(_posts: readonly Pick<WrongMapKey, 'id'>[]): ReadonlyMap<number, string> {
    return new Map();
  }
}

@Resolver()
class UnsupportedComputedResolver {
  @ResolveField()
  date(_post: Pick<OpaqueModel, 'id'>): Date {
    return new Date(0);
  }
}

@Resolver()
class LiteralComputedResolver {
  @ResolveField()
  state(_post: Pick<OpaqueModel, 'id'>): 'on' | 'off' {
    return 'on';
  }
}

@Resolver()
class BigintComputedResolver {
  @ResolveField()
  big(_post: Pick<OpaqueModel, 'id'>): bigint {
    return 1n;
  }
}

type WrongMapKey = { readonly id: ID<PostId>; readonly broken: string };
type OpaqueModel = {
  readonly id: ID;
  readonly date: Date;
  readonly state: 'on' | 'off';
  readonly big: bigint;
};

@Resolver()
class MissingAugmentedResolver extends GeneratedUserResolver {}

const resolvers = [UserResolver, PostResolver];
const tsconfig = resolve(__dirname, '../tsconfig.json');
let runtime: GeneratedGraphqlRuntime;
let resolversHash: string;
beforeAll(async () => {
  runtime = await generateGraphqlRuntimeForResolvers(resolvers, { tsconfig });
  resolversHash = await computeGraphqlPrebuiltHash('/graphql', resolvers);
}, 30_000);
beforeEach(() => {
  calls.length = 0;
});

it.each([
  [DuplicateColumnResolver, 'the provider already supplies it'],
  [WrongMapKeyResolver, 'Map key must match model id type'],
  [UnsupportedComputedResolver, 'OpaqueModel.date is not a scalar field'],
  [LiteralComputedResolver, 'OpaqueModel.state is not a scalar field'],
  [BigintComputedResolver, 'OpaqueModel.big is not a scalar field'],
  [MissingAugmentedResolver, 'GeneratedUser.displayName has no resolver'],
])('rejects invalid generated-model extensions: %s', async (resolver, message) => {
  await expect(generateGraphqlRuntimeForResolvers([resolver], { tsconfig })).rejects.toThrow(
    message,
  );
});

it('preserves generic ID assignability and rejects incompatible brands', () => {
  expectTypeOf<UserId>().toExtend<ID<UserId>>();
  expectTypeOf<ID<UserId>>().toExtend<UserId>();
  expectTypeOf<string>().not.toExtend<ID<UserId>>();
  expectTypeOf<UserId>().not.toExtend<ID<PostId>>();
  expectTypeOf<PostId>().toExtend<ID<PostId>>();
  expectTypeOf<ID<PostId>>().toExtend<PostId>();
  expectTypeOf<string>().toExtend<ID>();
  expectTypeOf<number>().not.toExtend<ID>();
  // @ts-expect-error GraphQL IDs are restricted to strings, including branded strings.
  type NumericId = ID<number>;
  expectTypeOf<NumericId>().not.toExtend<ID>();
});

it('renders merged model fields and primitive brands with the existing supplier contract', () => {
  expect(runtime.schemaSdl).toContain('type GeneratedUser {\n  id: ID!');
  expect(runtime.schemaSdl).toContain('type GeneratedPost {\n  id: ID!');
  expect(runtime.schemaSdl).toContain('firstName: String!');
  expect(runtime.schemaSdl).toContain('aliases: [String]');
  expect(runtime.schemaSdl).toContain('score: Float');
  expect(runtime.schemaSdl).toContain('scores: [Float!]!');
  expect(runtime.schemaSdl).toContain('brandedNames: [String]');
  expect(runtime.schemaSdl).toContain('brandedScore: Float');
  expect(runtime.schemaSdl).toContain('createdAt: String!');
  expect(runtime.schemaSdl).toContain('initials: String!');
  expect(runtime.schemaSdl).not.toContain('$');
  expect(runtime.models?.['GeneratedPost']?.properties.map(({ name }) => name)).not.toContain(
    'createdAt',
  );
});

describe.each(['sync', 'async'] as const)('generated resolver endpoint (%s)', (contextMode) => {
  it('injects both constructors and base fields, batches string ids and reuses relation data', async () => {
    const running = await createApp([
      http({ children: [graphql({ path: '/graphql', resolvers })] }),
    ]).createRuntime({
      contextMode,
      prebuilt: { version: 1, features: { graphql: { graphql: { runtime, resolversHash } } } },
    });
    try {
      for (let operation = 0; operation < 2; operation++) {
        calls.length = 0;
        const response = await running.http.request('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{
            users { id displayName initials hasPassword brandedNames posts {
              id score scores brandedScore scoresById createdAt author { displayName initials }
            } }
            posts { id createdAt scoresById }
          }`,
          }),
        });
        const post = {
          id: 'p1',
          score: 1,
          scores: [1],
          brandedScore: 1,
          scoresById: [1],
          createdAt: '2026-01-02T00:00:00.000Z',
          author: { displayName: 'Ada!', initials: 'A' },
        };
        const user = {
          id: 'u1',
          displayName: 'Ada!',
          initials: 'A',
          hasPassword: true,
          brandedNames: ['Ada', null],
          posts: [post],
        };
        expect(await response.json()).toEqual({
          data: {
            users: [user, user],
            posts: [1, 2].map(() => ({ id: 'p1', createdAt: post.createdAt, scoresById: [1] })),
          },
        });
        expect(calls.filter(({ method }) => method === 'users')).toEqual([
          { method: 'users', ids: ['u1'] },
        ]);
        expect(calls.filter(({ method }) => method === 'posts')).toEqual([
          { method: 'posts', ids: ['p1'] },
        ]);
        expect(calls.filter(({ method }) => method === 'scoresById')).toEqual([
          { method: 'scoresById', ids: ['p1'] },
        ]);
      }
    } finally {
      await running.shutdown();
    }
  });
});
