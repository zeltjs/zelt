import { buildSchema, defaultFieldResolver, graphql } from 'graphql';
import { describe, expect, it } from 'vitest';
import type {
  GraphqlModelBinding,
  GraphqlModelFields,
  GraphqlModelProperty,
  GraphqlModels,
} from './graphql-model.types';
import { createGraphqlModelExecution } from './graphql-model-runtime.lib';

const binding = (method: string): GraphqlModelBinding => ({ resolver: 'Users', method });
const models = {
  User: {
    provider: binding('provide'),
    properties: [
      { name: 'id', optional: false, value: { kind: 'scalar', name: 'string' } },
      { name: 'name', optional: false, value: { kind: 'scalar', name: 'string' } },
      { name: '$friend', optional: false, value: { kind: 'scalar', name: 'string' } },
    ],
  },
} satisfies GraphqlModels;
const modelFields: GraphqlModelFields = {
  Query: {
    users: {
      kind: 'query',
      target: 'User',
      shape: { kind: 'many', nullable: false, itemNullable: true },
    },
  },
  User: {
    label: { kind: 'computed', dependencies: ['name'] },
    friend: {
      kind: 'relation',
      mode: 'single',
      dependencies: ['$friend'],
      target: 'User',
      shape: { kind: 'one', nullable: true },
    },
    peers: {
      kind: 'relation',
      mode: 'batch',
      dependencies: ['id'],
      target: 'User',
      shape: { kind: 'many', nullable: false, itemNullable: false },
    },
  },
};
const schema = buildSchema(`
  type Query { users: [User]! }
  type User { id: ID!, name: String!, label: String!, friend: User, peers: [User!]! }
`);
type Invocation = { readonly method: string; readonly positional: readonly unknown[] };
const fixture = (
  overrides: Readonly<Record<string, (positional: readonly unknown[]) => unknown>> = {},
  definitions: GraphqlModels = models,
) => {
  const calls: Invocation[] = [];
  const methods: Readonly<Record<string, (positional: readonly unknown[]) => unknown>> = {
    users: () => [{ id: 'a', ignored: true }, { id: 'b' }, { id: 'a' }],
    provide: (positional) => {
      const refs = positional[0];
      if (!Array.isArray(refs)) throw new Error('Expected provider refs');
      return new Map(
        refs.map((ref: unknown) => {
          const id: unknown =
            typeof ref === 'object' && ref !== null ? Reflect.get(ref, 'id') : undefined;
          return [id, { id, name: `User ${String(id)}`, $friend: id === 'a' ? 'b' : 'a' }];
        }),
      );
    },
    label: (positional) => JSON.stringify(positional[0]),
    friend: (positional) => {
      const parent = positional[0];
      return {
        id:
          typeof parent === 'object' && parent !== null
            ? Reflect.get(parent, '$friend')
            : undefined,
      };
    },
    peers: (positional) => {
      const refs = positional[0];
      if (!Array.isArray(refs)) throw new Error('Expected relation refs');
      return new Map(
        refs.map((ref: unknown) => {
          const id: unknown =
            typeof ref === 'object' && ref !== null ? Reflect.get(ref, 'id') : undefined;
          return [id, [{ id: 'a' }, { id: 'a' }]];
        }),
      );
    },
    ...overrides,
  };
  const execute = async (source: string) => {
    const operation = createGraphqlModelExecution({
      models: definitions,
      modelFields,
      invoke: async (selected, positional) => {
        calls.push({ method: selected.method, positional });
        const method = methods[selected.method];
        if (!method) throw new Error('Missing fixture method');
        const value: unknown = method(positional);
        return { value };
      },
    });
    return graphql({
      schema,
      source,
      fieldResolver: (
        parent: unknown,
        args: Readonly<Record<string, unknown>>,
        context: unknown,
        info,
      ) => {
        if (!modelFields[info.parentType.name]?.[info.fieldName])
          return defaultFieldResolver(parent, args, context, info);
        const selected = binding(info.fieldName);
        return info.parentType.name === 'Query'
          ? operation.resolveQuery('Query', info.fieldName, selected, args)
          : operation.resolveField(info.parentType.name, info.fieldName, selected, parent, args);
      },
    });
  };
  return { calls, execute };
};

describe('model execution contracts', () => {
  it.each([
    {
      optional: false,
      value: { kind: 'optional', inner: { kind: 'scalar', name: 'string' } },
      supplied: { $friend: undefined },
      valid: true,
    },
    {
      optional: false,
      value: { kind: 'optional', inner: { kind: 'scalar', name: 'string' } },
      supplied: {},
      valid: false,
    },
    {
      optional: false,
      value: { kind: 'optional', inner: { kind: 'scalar', name: 'string' } },
      supplied: { $friend: null },
      valid: false,
    },
    {
      optional: true,
      value: { kind: 'optional', inner: { kind: 'scalar', name: 'string' } },
      supplied: {},
      valid: true,
    },
    {
      optional: false,
      value: { kind: 'nullable', inner: { kind: 'scalar', name: 'string' } },
      supplied: { $friend: null },
      valid: true,
    },
    {
      optional: false,
      value: { kind: 'nullable', inner: { kind: 'scalar', name: 'string' } },
      supplied: { $friend: undefined },
      valid: false,
    },
  ] satisfies readonly (Omit<GraphqlModelProperty, 'name'> & {
    supplied: object;
    valid: boolean;
  })[])(
    'distinguishes missing, undefined, and null source properties: %j',
    async ({ optional, value, supplied, valid }) => {
      const definitions: GraphqlModels = {
        User: {
          ...models.User,
          properties: [
            { name: 'id', optional: false, value: { kind: 'scalar', name: 'string' } },
            { name: '$friend', optional, value },
          ],
        },
      };
      const { execute } = fixture(
        {
          users: () => [{ id: 'a' }],
          provide: () => new Map([['a', { id: 'a', ...supplied }]]),
        },
        definitions,
      );
      const result = await execute('{ users { id } }');
      expect(result.errors === undefined).toBe(valid);
    },
  );
  it('consumes only id from references without reading unrelated getters', async () => {
    const ref = Object.defineProperty({ id: 'a' }, 'ignored', {
      enumerable: true,
      get() {
        throw new Error('Reference extras must not be read');
      },
    });
    const { execute } = fixture({ users: () => [ref] });
    expect(await execute('{ users { id } }')).toEqual({ data: { users: [{ id: 'a' }] } });
  });
  it('batches providers, preserves root duplicates and reuses nested identities only within an operation', async () => {
    const { execute, calls } = fixture();
    const result = await execute('{ users { id friend { id } peers { id } } }');
    expect(result.errors).toBeUndefined();
    expect(result.data?.['users']).toEqual([
      { id: 'a', friend: { id: 'b' }, peers: [{ id: 'a' }, { id: 'a' }] },
      { id: 'b', friend: { id: 'a' }, peers: [{ id: 'a' }, { id: 'a' }] },
      { id: 'a', friend: { id: 'b' }, peers: [{ id: 'a' }, { id: 'a' }] },
    ]);
    expect(calls.filter((call) => call.method === 'provide')).toEqual([
      { method: 'provide', positional: [[{ id: 'a' }, { id: 'b' }]] },
    ]);
    expect(calls.filter((call) => call.method === 'peers')).toHaveLength(1);
    await execute('{ users { id } }');
    expect(calls.filter((call) => call.method === 'provide')).toHaveLength(2);
  });

  it('projects computed dependencies and honors effective fragment and directive selections', async () => {
    const { execute, calls } = fixture();
    const result = await execute(
      'query { users { ...Name label @skip(if: true) friend @include(if: false) { id } } } fragment Name on User { alias: label }',
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.['users']).toEqual([
      { alias: '{"name":"User a"}' },
      { alias: '{"name":"User b"}' },
      { alias: '{"name":"User a"}' },
    ]);
    expect(calls.some((call) => call.method === 'friend' || call.method === 'peers')).toBe(false);
  });

  it('does not load empty lists', async () => {
    const { execute, calls } = fixture({ users: () => [] });
    expect(await execute('{ users { id } }')).toEqual({ data: { users: [] } });
    expect(calls.map((call) => call.method)).toEqual(['users']);
  });

  it('loads only newly discovered IDs in later nesting stages', async () => {
    const { execute, calls } = fixture({ friend: () => ({ id: 'c' }) });
    const result = await execute('{ users { friend { id friend { id } } } }');
    expect(result.errors).toBeUndefined();
    expect(calls.filter((call) => call.method === 'provide')).toEqual([
      { method: 'provide', positional: [[{ id: 'a' }, { id: 'b' }]] },
      { method: 'provide', positional: [[{ id: 'c' }]] },
    ]);
  });

  it('keeps identical IDs in different model caches independent', async () => {
    const calls: string[] = [];
    const execution = createGraphqlModelExecution({
      models: {
        User: models.User,
        Other: { provider: binding('otherProvider'), properties: [] },
      },
      modelFields: {
        Query: {
          first: { kind: 'query', target: 'User', shape: { kind: 'one', nullable: false } },
          second: { kind: 'query', target: 'Other', shape: { kind: 'one', nullable: false } },
        },
      },
      invoke: async (selected) => {
        calls.push(selected.method);
        if (selected.method === 'provide')
          return { value: new Map([['a', { id: 'a', name: 'A', $friend: 'a' }]]) };
        if (selected.method === 'otherProvider')
          return { value: new Map([['a', { id: 'a', name: 'Other' }]]) };
        return { value: { id: 'a' } };
      },
    });
    const results = await Promise.all([
      execution.resolveQuery('Query', 'first', binding('first'), {}),
      execution.resolveQuery('Query', 'second', binding('second'), {}),
    ]);
    expect(results).toEqual([
      { id: 'a', name: 'A', $friend: 'a' },
      { id: 'a', name: 'Other' },
    ]);
    expect(calls).toContain('provide');
    expect(calls).toContain('otherProvider');
  });

  it('preserves nullable missing values and reports element failures at their GraphQL paths', async () => {
    const { execute } = fixture({
      users: () => [{ id: 'a' }, null, { id: 'absent' }, { invalid: true }],
      provide: () =>
        new Map([
          ['a', { id: 'a', name: 'A', $friend: 'a' }],
          ['absent', null],
        ]),
    });
    const result = await execute('{ users { id } }');
    expect(result.data?.['users']).toEqual([{ id: 'a' }, null, null, null]);
    expect(result.errors?.map((error) => error.path)).toEqual([['users', 3]]);
  });

  it.each([
    ['missing key', () => new Map([['a', null]])],
    [
      'extra key',
      () =>
        new Map([
          ['a', null],
          ['b', null],
          ['c', null],
        ]),
    ],
    [
      'wrong id',
      () =>
        new Map([
          ['a', { id: 'wrong', name: 'A', $friend: 'b' }],
          ['b', null],
        ]),
    ],
    [
      'missing private field',
      () =>
        new Map([
          ['a', { id: 'a', name: 'A' }],
          ['b', null],
        ]),
    ],
    [
      'invalid property',
      () =>
        new Map([
          ['a', { id: 'a', name: 1, $friend: 'b' }],
          ['b', null],
        ]),
    ],
    [
      'acquisition failure',
      () => {
        throw new Error('Database unavailable');
      },
    ],
  ])('reports provider %s rather than converting failures to absence', async (_name, provide) => {
    const { execute } = fixture({ provide });
    const result = await execute('{ users { id } }');
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.data?.['users']).toEqual([null, null, null]);
  });

  it('rejects asynchronous computed fields', async () => {
    const { execute } = fixture({ label: () => Promise.resolve('invalid') });
    const result = await execute('{ users { label } }');
    expect(result.errors?.every((error) => error.message.includes('must be synchronous'))).toBe(
      true,
    );
    expect(result.data?.['users']).toEqual([null, null, null]);
  });

  it('awaits asynchronous queries, providers, single and batch relations independently', async () => {
    const { execute, calls } = fixture({
      users: async () => [{ id: 'a' }, { id: 'b' }],
      provide: async () =>
        new Map([
          ['a', { id: 'a', name: 'A', $friend: 'b' }],
          ['b', { id: 'b', name: 'B', $friend: 'a' }],
        ]),
      friend: async () => ({ id: 'a' }),
      peers: async () =>
        new Map([
          ['a', [{ id: 'b' }]],
          ['b', []],
        ]),
    });
    const result = await execute('{ users { friend { id } peers { id } } }');
    expect(result.errors).toBeUndefined();
    expect(result.data?.['users']).toEqual([
      { friend: { id: 'a' }, peers: [{ id: 'b' }] },
      { friend: { id: 'a' }, peers: [] },
    ]);
    expect(calls.filter((call) => call.method === 'provide')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'peers')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'friend')).toHaveLength(2);
  });

  it('observes rejected computed Promises while surfacing their contract failure', async () => {
    const { execute } = fixture({ label: () => Promise.reject(new Error('Invalid computed I/O')) });
    const result = await execute('{ users { label } }');
    expect(result.errors?.every((error) => error.message.includes('must be synchronous'))).toBe(
      true,
    );
  });

  it('does not treat sparse reference list entries as absent references', async () => {
    const { execute } = fixture({
      users: () => {
        const references: unknown[] = [];
        references.length = 2;
        return references;
      },
    });
    const result = await execute('{ users { id } }');
    expect(result.data?.['users']).toEqual([null, null]);
    expect(result.errors?.map((error) => error.path)).toEqual([
      ['users', 0],
      ['users', 1],
    ]);
  });

  it('reports incomplete relation Maps and missing non-null targets', async () => {
    const incomplete = fixture({ peers: () => new Map() });
    const result = await incomplete.execute('{ users { peers { id } } }');
    expect(result.errors?.length).toBe(3);
    const missing = fixture({
      peers: () =>
        new Map([
          ['a', [null]],
          ['b', []],
        ]),
    });
    const absent = await missing.execute('{ users { peers { id } } }');
    expect(absent.errors?.map((error) => error.path)).toEqual([
      ['users', 0, 'peers', 0],
      ['users', 2, 'peers', 0],
    ]);
  });
});
