import { describe, expect, it } from 'vitest';
import { parseGraphqlModelManifest } from './graphql-model-manifest.lib';

const id = { name: 'id', optional: false, value: { kind: 'scalar', name: 'string' } };
const provider = { resolver: 'Users', method: 'provide' };
const model = { provider, mode: 'batch', properties: [id] };
const models = { User: model };
const query = { kind: 'query', target: 'User', shape: { kind: 'one', nullable: false } };
const relation = {
  kind: 'relation',
  target: 'User',
  mode: 'batch',
  dependencies: ['id'],
  shape: { kind: 'many', nullable: false, itemNullable: false },
};
const computed = {
  kind: 'computed',
  mode: 'batch',
  dependencies: ['id'],
  value: { kind: 'scalar', name: 'string' },
};
const fields = { Query: { user: query }, User: { friends: relation, caption: computed } };

describe('GraphQL model manifest boundary', () => {
  it('accepts complete metadata with source dependencies and recursive descriptors', () => {
    const complete = {
      User: {
        provider,
        mode: 'batch',
        properties: [
          id,
          { name: '$private', optional: true, value: { kind: 'opaque' } },
          {
            name: 'values',
            optional: false,
            value: {
              kind: 'nullable',
              inner: { kind: 'array', item: { kind: 'scalar', name: 'number' } },
            },
          },
        ],
      },
    };
    expect(parseGraphqlModelManifest(complete, fields)).toEqual({
      models: complete,
      modelFields: fields,
    });
    expect(parseGraphqlModelManifest({}, {})).toEqual({ models: {}, modelFields: {} });
  });

  it.each([
    { ...model, mode: undefined },
    { ...model, mode: 'invalid' },
    [undefined, fields],
    [models, undefined],
    [null, fields],
    [[], fields],
    [models, []],
  ])('rejects a missing or malformed metadata pair', (rawModels, rawFields) => {
    expect(parseGraphqlModelManifest(rawModels, rawFields)).toBeUndefined();
  });

  it.each([
    { ...model, provider: { resolver: 'Users' } },
    { ...model, properties: [] },
    { ...model, properties: [id, id] },
    { ...model, properties: [{ ...id, optional: true }] },
    { ...model, properties: [{ ...id, value: { kind: 'scalar', name: 'number' } }] },
    { ...model, properties: [{ ...id, value: { kind: 'scalar', name: 'unknown' } }] },
    { ...model, properties: [{ ...id, value: { kind: 'array' } }] },
    { ...model, properties: [{ ...id, value: { kind: 'nullable' } }] },
    { ...model, properties: [{ ...id, value: { kind: 'invalid' } }] },
  ])(
    'rejects invalid providers, duplicate properties and invalid identity descriptors',
    (invalid) => {
      expect(parseGraphqlModelManifest({ User: invalid }, fields)).toBeUndefined();
    },
  );

  it.each([
    { ...query, kind: 'invalid' },
    { ...query, target: 'Missing' },
    { ...query, target: 'toString' },
    { ...query, shape: { kind: 'one' } },
    { ...query, shape: { kind: 'many', nullable: true } },
    { ...query, shape: { kind: 'invalid', nullable: false } },
  ])('rejects invalid query descriptors', (invalid) => {
    expect(parseGraphqlModelManifest(models, { Query: { user: invalid } })).toBeUndefined();
  });

  it.each([
    { ...relation, mode: 'invalid' },
    { ...relation, target: 'Missing' },
    { ...relation, dependencies: ['id', 'id'] },
    { ...relation, dependencies: ['computed'] },
    { ...relation, dependencies: [1] },
    { ...relation, dependencies: null },
    { ...relation, dependencies: [] },
    { ...computed, dependencies: ['friends'] },
    { ...computed, dependencies: [] },
    { ...computed, mode: undefined },
    { ...computed, mode: 'invalid' },
    { ...computed, value: undefined },
    { ...computed, value: { kind: 'opaque' } },
    { kind: 'computed' },
  ])('rejects invalid relation modes, dependencies and computed dependencies', (invalid) => {
    expect(parseGraphqlModelManifest(models, { User: { field: invalid } })).toBeUndefined();
  });

  it('rejects fields registered on an invalid owner', () => {
    expect(parseGraphqlModelManifest(models, { User: { user: query } })).toBeUndefined();
    expect(parseGraphqlModelManifest(models, { Missing: { friend: relation } })).toBeUndefined();
    expect(
      parseGraphqlModelManifest(models, {
        Query: { field: { ...computed, mode: 'single', dependencies: [] } },
      }),
    ).toBeUndefined();
  });

  it('bounds recursive value descriptors and rejects sparse property/dependency arrays', () => {
    let value: unknown = { kind: 'opaque' };
    for (let depth = 0; depth < 66; depth += 1) value = { kind: 'array', item: value };
    expect(
      parseGraphqlModelManifest(
        { User: { ...model, properties: [id, { name: '$deep', optional: false, value }] } },
        fields,
      ),
    ).toBeUndefined();
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(
      parseGraphqlModelManifest({ User: { ...model, properties: sparse } }, fields),
    ).toBeUndefined();
    expect(
      parseGraphqlModelManifest(models, { User: { field: { ...relation, dependencies: sparse } } }),
    ).toBeUndefined();
  });

  it('preserves single modes and per-parent computed output shapes', () => {
    const singleModels = { User: { ...model, mode: 'single' } };
    const singleFields = {
      User: {
        caption: {
          ...computed,
          mode: 'single',
          dependencies: [],
          value: {
            kind: 'nullable',
            inner: { kind: 'array', item: { kind: 'scalar', name: 'string' } },
          },
        },
      },
    };
    expect(parseGraphqlModelManifest(singleModels, singleFields)).toEqual({
      models: singleModels,
      modelFields: singleFields,
    });
  });
});
