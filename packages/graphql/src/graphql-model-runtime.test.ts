import { runInNewContext } from 'node:vm';
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
const inputId = (value: unknown): string => {
  if (typeof value !== 'object' || value === null) throw new Error('Expected parent');
  const id: unknown = Reflect.get(value, 'id');
  if (typeof id !== 'string') throw new Error('Expected parent id');
  return id;
};
const models = {
  User: {
    mode: 'batch',
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
    user: { kind: 'query', target: 'User', shape: { kind: 'one', nullable: true } },
    users: {
      kind: 'query',
      target: 'User',
      shape: { kind: 'many', nullable: false, itemNullable: true },
    },
  },
  User: {
    label: {
      kind: 'computed',
      mode: 'single',
      dependencies: ['name'],
      value: { kind: 'scalar', name: 'string' },
    },
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
  type Query { users: [User]!, user: User }
  type User { id: ID!, name: String!, label: String!, maybeLabel: String, friend: User, peers: [User!]! }
`);
type Invocation = { readonly method: string; readonly positional: readonly unknown[] };
const fixture = (
  overrides: Readonly<Record<string, (positional: readonly unknown[]) => unknown>> = {},
  definitions: GraphqlModels = models,
  fieldDefinitions: GraphqlModelFields = modelFields,
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
      modelFields: fieldDefinitions,
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
        if (!fieldDefinitions[info.parentType.name]?.[info.fieldName])
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
  it('preserves absent dependencies separately from explicit undefined', async () => {
    const definitions: GraphqlModels = {
      User: {
        ...models.User,
        properties: [
          ...models.User.properties,
          {
            name: 'nickname',
            optional: true,
            value: { kind: 'optional', inner: { kind: 'scalar', name: 'string' } },
          },
        ],
      },
    };
    const fields: GraphqlModelFields = {
      ...modelFields,
      User: {
        ...modelFields['User'],
        label: {
          kind: 'computed',
          mode: 'single',
          dependencies: ['nickname'],
          value: { kind: 'scalar', name: 'string' },
        },
      },
    };
    const { execute } = fixture(
      {
        users: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        provide: () =>
          new Map([
            ['a', { id: 'a', name: 'A', $friend: 'a' }],
            ['b', { id: 'b', name: 'B', $friend: 'b', nickname: undefined }],
            ['c', { id: 'c', name: 'C', $friend: 'c', nickname: 'Ada' }],
          ]),
        label: ([parent]) => {
          if (typeof parent !== 'object' || parent === null) throw new Error('Expected parent');
          if (!('nickname' in parent)) return 'MISSING';
          return typeof parent.nickname === 'string' ? parent.nickname.toUpperCase() : 'UNDEFINED';
        },
      },
      definitions,
      fields,
    );
    expect(await execute('{ users { label } }')).toEqual({
      data: { users: [{ label: 'MISSING' }, { label: 'UNDEFINED' }, { label: 'ADA' }] },
    });
  });
  it('hydrates a single Query reference without reading an extra then getter', async () => {
    // oxlint-disable-next-line unicorn/no-thenable -- Regression fixture: reference extras must not be assimilated.
    const ref = Object.defineProperty({ id: 'a' }, 'then', {
      get() {
        throw new Error('Reference then must not be read');
      },
    });
    const { execute } = fixture({ user: () => ref });
    expect(await execute('{ user { id } }')).toEqual({ data: { user: { id: 'a' } } });
  });

  it.each([
    { mode: 'single', asynchronous: false },
    { mode: 'batch', asynchronous: false },
    { mode: 'batch', asynchronous: true },
  ] as const)(
    'hydrates $mode relation references without reading extra then getters (async=$asynchronous)',
    async ({ mode, asynchronous }) => {
      // oxlint-disable-next-line unicorn/no-thenable -- Regression fixture: reference extras must not be assimilated.
      const ref = Object.defineProperty({ id: 'a' }, 'then', {
        enumerable: true,
        get() {
          throw new Error('Relation reference then must not be read');
        },
      });
      const fields: GraphqlModelFields = {
        ...modelFields,
        User: {
          ...modelFields['User'],
          friend: {
            kind: 'relation',
            mode,
            dependencies: ['id'],
            target: 'User',
            shape: { kind: 'one', nullable: true },
          },
        },
      };
      const { execute } = fixture(
        {
          friend: () => {
            const value =
              mode === 'single'
                ? ref
                : new Map([
                    ['a', ref],
                    ['b', ref],
                  ]);
            return asynchronous ? Promise.resolve(value) : value;
          },
        },
        models,
        fields,
      );
      expect(await execute('{ users { friend { id } } }')).toEqual({
        data: {
          users: [{ friend: { id: 'a' } }, { friend: { id: 'a' } }, { friend: { id: 'a' } }],
        },
      });
    },
  );
  it.each([
    { mode: 'single', asynchronous: false },
    { mode: 'single', asynchronous: true },
    { mode: 'batch', asynchronous: false },
    { mode: 'batch', asynchronous: true },
  ] as const)(
    'executes $mode providers independently of async=$asynchronous and caches IDs',
    async ({ mode, asynchronous }) => {
      const definitions: GraphqlModels = { User: { ...models.User, mode } };
      const { execute, calls } = fixture(
        {
          provide: ([input]) => {
            const refs = mode === 'batch' && Array.isArray(input) ? input : [input];
            const rows = refs.map((ref: unknown) => {
              const id = inputId(ref);
              return { id, name: id, $friend: id };
            });
            const value = mode === 'batch' ? new Map(rows.map((row) => [row.id, row])) : rows[0];
            return asynchronous ? Promise.resolve(value) : value;
          },
        },
        definitions,
      );
      const result = await execute('{ users { id friend { id } } }');
      expect(result.errors).toBeUndefined();
      expect(result.data?.['users']).toEqual(['a', 'b', 'a'].map((id) => ({ id, friend: { id } })));
      expect(calls.filter((call) => call.method === 'provide')).toHaveLength(
        mode === 'batch' ? 1 : 2,
      );
      await execute('{ users { id } }');
      expect(calls.filter((call) => call.method === 'provide')).toHaveLength(
        mode === 'batch' ? 2 : 4,
      );
    },
  );

  it.each([
    { mode: 'single', asynchronous: false },
    { mode: 'single', asynchronous: true },
    { mode: 'batch', asynchronous: false },
    { mode: 'batch', asynchronous: true },
  ] as const)(
    'executes $mode computed fields independently of async=$asynchronous',
    async ({ mode, asynchronous }) => {
      const fields: GraphqlModelFields = {
        ...modelFields,
        User: {
          ...modelFields['User'],
          label: {
            kind: 'computed',
            mode,
            dependencies: ['id', 'name'],
            value: { kind: 'scalar', name: 'string' },
          },
        },
      };
      const { execute, calls } = fixture(
        {
          label: ([input]) => {
            const refs = mode === 'batch' && Array.isArray(input) ? input : [input];
            const values = refs.map(
              (ref: unknown) => [inputId(ref), `Computed ${inputId(ref)}`] as const,
            );
            const value = mode === 'batch' ? new Map(values) : values[0]?.[1];
            return asynchronous ? Promise.resolve(value) : value;
          },
        },
        models,
        fields,
      );
      const result = await execute('{ users { label other: label } }');
      expect(result.errors).toBeUndefined();
      expect(result.data?.['users']).toEqual(
        ['a', 'b', 'a'].map((id) => ({ label: `Computed ${id}`, other: `Computed ${id}` })),
      );
      const computed = calls.filter((call) => call.method === 'label');
      expect(computed).toHaveLength(mode === 'batch' ? 1 : 6);
      if (mode === 'batch')
        expect(computed[0]?.positional).toEqual([
          [
            { id: 'a', name: 'User a' },
            { id: 'b', name: 'User b' },
          ],
        ]);
      await execute('{ users { label other: label } }');
      expect(calls.filter((call) => call.method === 'label')).toHaveLength(
        mode === 'batch' ? 2 : 12,
      );
    },
  );

  it('isolates single-provider failures and caches explicit absence', async () => {
    const definitions: GraphqlModels = { User: { ...models.User, mode: 'single' } };
    const { execute, calls } = fixture(
      {
        provide: async ([ref]) => {
          const id = inputId(ref);
          if (id === 'b') throw new Error('Provider failed');
          return null;
        },
      },
      definitions,
    );
    const result = await execute('{ users { id } }');
    expect(result.data?.['users']).toEqual([null, null, null]);
    expect(result.errors?.map((error) => error.path)).toEqual([['users', 1]]);
    expect(calls.filter((call) => call.method === 'provide')).toHaveLength(2);
  });

  it.each([
    { mode: 'single', asynchronous: false },
    { mode: 'single', asynchronous: true },
    { mode: 'batch', asynchronous: false },
    { mode: 'batch', asynchronous: true },
  ] as const)(
    'executes nullable $mode relations independently of async=$asynchronous',
    async ({ mode, asynchronous }) => {
      const fields: GraphqlModelFields = {
        ...modelFields,
        User: {
          ...modelFields['User'],
          friend: {
            kind: 'relation',
            mode,
            dependencies: ['id', '$friend'],
            target: 'User',
            shape: { kind: 'one', nullable: true },
          },
        },
      };
      const { execute, calls } = fixture(
        {
          friend: ([input]) => {
            const refs = mode === 'batch' && Array.isArray(input) ? input : [input];
            const values = refs.map(
              (ref: unknown) => [inputId(ref), inputId(ref) === 'a' ? null : { id: 'a' }] as const,
            );
            const value = mode === 'batch' ? new Map(values) : values[0]?.[1];
            return asynchronous ? Promise.resolve(value) : value;
          },
        },
        models,
        fields,
      );
      const result = await execute('{ users { id friend { id } } }');
      expect(result.errors).toBeUndefined();
      expect(result.data?.['users']).toEqual([
        { id: 'a', friend: null },
        { id: 'b', friend: { id: 'a' } },
        { id: 'a', friend: null },
      ]);
      expect(calls.filter((call) => call.method === 'friend')).toHaveLength(
        mode === 'batch' ? 1 : 3,
      );
    },
  );

  it.each(['single', 'batch'] as const)(
    'propagates %s relation I/O failures at the relation path',
    async (mode) => {
      const fields: GraphqlModelFields = {
        ...modelFields,
        User: {
          ...modelFields['User'],
          friend: {
            kind: 'relation',
            mode,
            dependencies: ['id'],
            target: 'User',
            shape: { kind: 'one', nullable: true },
          },
        },
      };
      const { execute } = fixture(
        {
          friend: async () => {
            throw new Error('Relation failed');
          },
        },
        models,
        fields,
      );
      const result = await execute('{ users { id friend { id } } }');
      expect(result.data?.['users']).toEqual(['a', 'b', 'a'].map((id) => ({ id, friend: null })));
      expect(result.errors?.map((error) => error.path)).toEqual([
        ['users', 0, 'friend'],
        ['users', 1, 'friend'],
        ['users', 2, 'friend'],
      ]);
    },
  );

  it.each(['provide', 'peers', 'label'])(
    'rejects and observes all promised %s Map values',
    async (method) => {
      const fields: GraphqlModelFields = {
        ...modelFields,
        User: {
          ...modelFields['User'],
          label: {
            kind: 'computed',
            mode: 'batch',
            dependencies: ['id'],
            value: { kind: 'scalar', name: 'string' },
          },
        },
      };
      const { execute } = fixture(
        {
          [method]: () =>
            new Map([
              ['a', Promise.reject(new Error('Invalid Map value A'))],
              ['b', Promise.reject(new Error('Invalid Map value B'))],
            ]),
        },
        models,
        fields,
      );
      const result = await execute('{ users { id peers { id } label } }');
      expect(
        result.errors?.some((error) => error.message.includes('Map values must not be Promises')),
      ).toBe(true);
    },
  );

  it.each(['single', 'batch'] as const)(
    'preserves nullable %s computed results and exception paths',
    async (mode) => {
      const fields: GraphqlModelFields = {
        ...modelFields,
        User: {
          ...modelFields['User'],
          maybeLabel: {
            kind: 'computed',
            mode,
            dependencies: ['id'],
            value: { kind: 'nullable', inner: { kind: 'scalar', name: 'string' } },
          },
        },
      };
      const nullable = fixture(
        {
          maybeLabel: () =>
            mode === 'batch'
              ? Promise.resolve(
                  new Map([
                    ['a', null],
                    ['b', null],
                  ]),
                )
              : Promise.resolve(null),
        },
        models,
        fields,
      );
      expect((await nullable.execute('{ users { maybeLabel } }')).data?.['users']).toEqual([
        { maybeLabel: null },
        { maybeLabel: null },
        { maybeLabel: null },
      ]);
      const failure = fixture(
        {
          maybeLabel: async () => {
            throw new Error('Computed failed');
          },
        },
        models,
        fields,
      );
      const result = await failure.execute('{ users { maybeLabel } }');
      expect(result.data?.['users']).toEqual([
        { maybeLabel: null },
        { maybeLabel: null },
        { maybeLabel: null },
      ]);
      expect(result.errors?.map((error) => error.path)).toEqual([
        ['users', 0, 'maybeLabel'],
        ['users', 1, 'maybeLabel'],
        ['users', 2, 'maybeLabel'],
      ]);
    },
  );

  it('validates computed batch Map completeness and rejects promised Map values', async () => {
    const fields: GraphqlModelFields = {
      ...modelFields,
      User: {
        ...modelFields['User'],
        label: {
          kind: 'computed',
          mode: 'batch',
          dependencies: ['id'],
          value: { kind: 'scalar', name: 'string' },
        },
      },
    };
    for (const value of [
      new Map([['a', 'A']]),
      new Map([
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]),
      new Map([
        ['a', Promise.resolve('A')],
        ['b', Promise.resolve('B')],
      ]),
    ]) {
      const { execute } = fixture({ label: () => value }, models, fields);
      const result = await execute('{ users { label } }');
      expect(result.errors).toHaveLength(3);
    }
  });
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
        Other: { mode: 'batch', provider: binding('otherProvider'), properties: [] },
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

  it('awaits asynchronous single computed fields', async () => {
    const { execute } = fixture({ label: () => Promise.resolve('computed') });
    const result = await execute('{ users { label } }');
    expect(result.errors).toBeUndefined();
    expect(result.data?.['users']).toEqual([
      { label: 'computed' },
      { label: 'computed' },
      { label: 'computed' },
    ]);
  });

  it('awaits Promise-compatible values across realms without relying on instanceof', async () => {
    const references: unknown = runInNewContext('Promise.resolve([{ id: "a" }])');
    const friend: unknown = runInNewContext('Promise.resolve({ id: "b" })');
    const label: unknown = runInNewContext('Promise.resolve("computed")');
    const { execute } = fixture({
      users: () => references,
      friend: () => friend,
      label: () => label,
    });
    expect(await execute('{ users { label friend { id } } }')).toEqual({
      data: { users: [{ label: 'computed', friend: { id: 'b' } }] },
    });
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

  it('propagates rejected computed I/O with field paths', async () => {
    const { execute } = fixture({ label: () => Promise.reject(new Error('Computed I/O failed')) });
    const result = await execute('{ users { label } }');
    expect(result.errors?.map((error) => error.path)).toEqual([
      ['users', 0, 'label'],
      ['users', 1, 'label'],
      ['users', 2, 'label'],
    ]);
    expect(result.errors?.every((error) => error.message === 'Computed I/O failed')).toBe(true);
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
