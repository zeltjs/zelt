import { resolve } from 'node:path';
import type { ZeltPrebuilt } from '@zeltjs/core';
import { createApp, http, request } from '@zeltjs/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import { createGraphqlExecutor, parseGraphqlPrebuiltEntry } from './graphql-runtime.lib';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import { graphql, Query, Relation, ResolveField, ResolveMultiField, Resolver } from './index';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';

type Account = {
  id: string;
  first: string;
  last: string;
  $identity: string;
  constructor: string;
  name: string;
  labels: readonly string[] | null;
  publicEntries: readonly Entry[];
};
type Entry = { id: string; title: string; $author: string; author: Account };
type Score = { id: string; value: number };
type Call = { readonly method: string; readonly ids: readonly string[]; readonly identity: string };
const calls: Call[] = [];

@Resolver()
class Accounts {
  @Query('toString')
  objectLabel(): Pick<Account, 'id'> {
    return { id: 'a' };
  }

  @ResolveField('constructor')
  typeLabel(account: Pick<Account, 'first'>): string {
    return account.first;
  }
  @Query()
  accounts(): readonly Pick<Account, 'id'>[] {
    return [{ id: 'a' }, { id: 'b' }, { id: 'a' }];
  }

  @Query()
  missing(): Pick<Account, 'id'> | null {
    return null;
  }

  @Query()
  missingStrict(): Pick<Account, 'id'> {
    return { id: 'absent' };
  }

  @Query()
  unavailable(): Pick<Account, 'id'> | null {
    return { id: 'unavailable' };
  }

  @ResolveMultiField()
  async load(
    refs: readonly Pick<Account, 'id'>[],
    req = request(),
  ): Promise<ReadonlyMap<Account['id'], Pick<Account, 'id' | 'first' | 'last' | '$identity'>>> {
    const identity = req.header('X-Identity');
    if (identity === undefined) throw new Error('Identity header required by test provider');
    await Promise.resolve();
    calls.push({ method: 'accounts', ids: refs.map((ref) => ref.id), identity });
    if (refs.some((ref) => ref.id === 'unavailable')) throw new Error('Data source unavailable');
    if (refs.some((ref) => ref.id === 'absent')) throw new Error('Account not found');
    return new Map(
      refs.map(({ id }) => [id, { id, first: id, last: 'User', $identity: identity }]),
    );
  }

  @ResolveField()
  async name(account: Pick<Account, 'first' | 'last' | '$identity'>): Promise<string> {
    await Promise.resolve();
    expect(Object.keys(account).sort()).toEqual(['$identity', 'first', 'last']);
    return `${account.first} ${account.last}:${account.$identity}`;
  }

  @ResolveField()
  async labels(
    accounts: readonly Pick<Account, 'id' | 'first' | '$identity'>[],
    req = request(),
  ): Promise<ReadonlyMap<Account['id'], readonly string[] | null>> {
    await Promise.resolve();
    const identity = req.header('X-Identity');
    if (identity === undefined) throw new Error('Identity header required by test field');
    calls.push({ method: 'labels', ids: accounts.map((account) => account.id), identity });
    return new Map(
      [...accounts]
        .reverse()
        .map((account) => [
          account.id,
          account.id === 'b' ? null : [account.first, account.$identity, identity],
        ]),
    );
  }

  @Relation()
  publicEntries(
    accounts: readonly Pick<Account, 'id'>[],
    req = request(),
  ): ReadonlyMap<Account['id'], readonly Pick<Entry, 'id'>[]> {
    const identity = req.header('X-Identity');
    if (identity === undefined) throw new Error('Identity header required by test relation');
    calls.push({ method: 'publicEntries', ids: accounts.map((account) => account.id), identity });
    return new Map(accounts.map(({ id }) => [id, [{ id: `entry-${id}` }]]));
  }
}

@Resolver()
class Entries {
  @ResolveMultiField()
  load(
    refs: readonly Pick<Entry, 'id'>[],
    req = request(),
  ): ReadonlyMap<Entry['id'], Pick<Entry, 'id' | 'title' | '$author'>> {
    const identity = req.header('X-Identity');
    if (identity === undefined) throw new Error('Identity header required by test provider');
    calls.push({ method: 'entries', ids: refs.map((ref) => ref.id), identity });
    return new Map(
      refs.map(({ id }) => [id, { id, title: id, $author: id.slice('entry-'.length) }]),
    );
  }

  @Relation()
  author(entry: Pick<Entry, '$author'>): Pick<Account, 'id'> {
    expect(Object.keys(entry)).toEqual(['$author']);
    return { id: entry.$author };
  }
}

@Resolver()
class Scores {
  @Query()
  scores(): readonly Pick<Score, 'id'>[] {
    return [{ id: 'a' }, { id: 'bb' }, { id: 'a' }];
  }

  @ResolveMultiField()
  async load(ref: Pick<Score, 'id'>, req = request()): Promise<Score> {
    await Promise.resolve();
    const identity = req.header('X-Identity');
    if (identity === undefined) throw new Error('Identity header required by test provider');
    calls.push({ method: 'scores', ids: [ref.id], identity });
    return { id: ref.id, value: ref.id.length };
  }
}

const resolvers = [Accounts, Entries, Scores];
let generated: GeneratedGraphqlRuntime;
let resolversHash: string;

// TypeScript program construction uses the same budget as the codegen tests.
beforeAll(async () => {
  generated = await generateGraphqlRuntimeForResolvers(resolvers, {
    tsconfig: resolve(__dirname, '../tsconfig.json'),
  });
  resolversHash = await computeGraphqlPrebuiltHash('/graphql', resolvers);
}, 30_000);
beforeEach(() => {
  calls.length = 0;
});

const start = (contextMode: 'sync' | 'async') => {
  const prebuilt: ZeltPrebuilt = {
    version: 1,
    features: { graphql: { graphql: { runtime: generated, resolversHash } } },
  };
  return createApp([http({ children: [graphql({ path: '/graphql', resolvers })] })]).createRuntime({
    prebuilt,
    contextMode,
  });
};

describe.each(['sync', 'async'] as const)('generated model endpoint (%s)', (mode) => {
  it('publishes a per-parent result for async batch fields and caches single providers', async () => {
    const running = await start(mode);
    try {
      const response = await running.http.request('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Identity': 'one' },
        body: JSON.stringify({
          query: '{ accounts { first: labels second: labels } scores { value } }',
        }),
      });
      const labels = ['a', 'one', 'one'];
      expect(await response.json()).toEqual({
        data: {
          accounts: [
            { first: labels, second: labels },
            { first: null, second: null },
            { first: labels, second: labels },
          ],
          scores: [{ value: 1 }, { value: 2 }, { value: 1 }],
        },
      });
      expect(calls.filter((call) => call.method === 'labels')).toEqual([
        { method: 'labels', ids: ['a', 'b'], identity: 'one' },
      ]);
      expect(calls.filter((call) => call.method === 'scores').map((call) => call.ids)).toEqual([
        ['a'],
        ['bb'],
      ]);
      expect(generated.schemaSdl).toContain('labels: [String!]');
      expect(generated.schemaSdl).not.toContain('Map');
    } finally {
      await running.shutdown();
    }
  });
  it('resolves legal GraphQL names that also exist on Object.prototype', async () => {
    const running = await start(mode);
    try {
      const response = await running.http.request('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Identity': 'one' },
        body: JSON.stringify({ query: '{ toString { constructor } }' }),
      });
      expect(await response.json()).toEqual({ data: { toString: { constructor: 'a' } } });
    } finally {
      await running.shutdown();
    }
  });
  it('lets queries answer null and reports ids without data at the field that needs them', async () => {
    const running = await start(mode);
    try {
      const send = async (query: string) => {
        const response = await running.http.request('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Identity': 'one' },
          body: JSON.stringify({ query }),
        });
        return response.json();
      };
      expect(await send('{ missing { id } }')).toEqual({ data: { missing: null } });
      expect(await send('{ required: missingStrict { id } }')).toEqual({
        data: { required: { id: 'absent' } },
      });
      expect(await send('{ required: missingStrict { first } }')).toMatchObject({
        data: null,
        errors: [{ message: 'Account not found', path: ['required', 'first'] }],
      });
      expect(await send('{ unavailable { first } }')).toMatchObject({
        data: { unavailable: null },
        errors: [{ message: 'Data source unavailable', path: ['unavailable', 'first'] }],
      });
    } finally {
      await running.shutdown();
    }
  });
  it('executes nested references with three batched acquisitions and shared authors', async () => {
    const running = await start(mode);
    try {
      const response = await running.http.request('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Identity': 'one' },
        body: JSON.stringify({
          query:
            'query($skip: Boolean!) { accounts { label: name ...Entries } } fragment Entries on Account { publicEntries @skip(if: $skip) { title author { name } } }',
          variables: { skip: false },
        }),
      });
      expect(await response.json()).toEqual({
        data: {
          accounts: ['a', 'b', 'a'].map((id) => ({
            label: `${id} User:one`,
            publicEntries: [{ title: `entry-${id}`, author: { name: `${id} User:one` } }],
          })),
        },
      });
      expect(calls).toEqual([
        { method: 'accounts', ids: ['a', 'b'], identity: 'one' },
        { method: 'publicEntries', ids: ['a', 'b'], identity: 'one' },
        { method: 'entries', ids: ['entry-a', 'entry-b'], identity: 'one' },
      ]);
      expect(generated.schemaSdl).not.toContain('$');
      expect(generated.schemaSdl).toContain('author: Account!');
    } finally {
      await running.shutdown();
    }
  });

  it('keeps concurrent operation data isolated and does not execute skipped relations', async () => {
    const running = await start(mode);
    try {
      const responses = await Promise.all(
        ['one', 'two'].map((identity) =>
          running.http.request('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Identity': identity },
            body: JSON.stringify({
              query: '{ accounts { name publicEntries @include(if: false) { id } } }',
            }),
          }),
        ),
      );
      for (const [index, response] of responses.entries()) {
        const identity = index === 0 ? 'one' : 'two';
        expect(await response.json()).toEqual({
          data: { accounts: ['a', 'b', 'a'].map((id) => ({ name: `${id} User:${identity}` })) },
        });
      }
      expect(calls).toHaveLength(2);
      expect(calls.map((call) => call.method)).toEqual(['accounts', 'accounts']);
      expect(new Set(calls.map((call) => call.identity))).toEqual(new Set(['one', 'two']));
    } finally {
      await running.shutdown();
    }
  });
});

it('preserves generated model contracts through the prebuilt JSON boundary', () => {
  const serialized: unknown = JSON.parse(JSON.stringify({ runtime: generated, resolversHash }));
  const parsed = parseGraphqlPrebuiltEntry(serialized);
  expect(parsed?.runtime.models).toEqual(generated.models);
  expect(parsed?.runtime.modelFields).toEqual(generated.modelFields);
});

it.each([
  ['accounts: [Account!]!', 'accounts: Account'],
  ['accounts: [Account!]!', 'accounts: [Entry!]!'],
  ['first: String!', 'first: Int!'],
  ['labels: [String!]', 'labels: String'],
])('rejects stale SDL when %s changes to %s', (before, after) => {
  expect(generated.schemaSdl).toContain(before);
  expect(() =>
    createGraphqlExecutor({
      runtime: { ...generated, schemaSdl: generated.schemaSdl.replace(before, after) },
      resolvers,
      resolveResolver: (resolver) => new resolver(),
    }),
  ).toThrow(/type mismatch/);
});

it('rejects undeclared model SDL fields before provider extras can be exposed', () => {
  expect(() =>
    createGraphqlExecutor({
      runtime: {
        ...generated,
        schemaSdl: generated.schemaSdl.replace(
          'first: String!',
          'first: String! legacySecret: String',
        ),
      },
      resolvers,
      resolveResolver: (resolver) => new resolver(),
    }),
  ).toThrow('Unexpected GraphQL model field: Account.legacySecret');
});
