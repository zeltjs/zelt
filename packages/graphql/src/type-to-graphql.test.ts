import type { TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';

import {
  addGraphqlField,
  convertTypeInfoToGraphqlRef,
  createGraphqlTypeContext,
  typeInfoToGraphqlType,
} from './type-to-graphql.lib';

describe('typeInfoToGraphqlType', () => {
  it('allocates distinct direct object names around model names and previously generated names', () => {
    const modelNames = new Set(['Score', 'ScoreData', 'ScoreDataDataItems']);
    const ctx = createGraphqlTypeContext(modelNames);
    const first = convertTypeInfoToGraphqlRef(
      {
        kind: 'object',
        properties: [
          {
            name: 'items',
            optional: false,
            type: {
              kind: 'array',
              items: {
                kind: 'object',
                properties: [
                  { name: 'value', optional: false, type: { kind: 'primitive', type: 'number' } },
                ],
              },
            },
          },
        ],
      },
      ctx,
      'Score',
    );
    const second = convertTypeInfoToGraphqlRef(
      {
        kind: 'object',
        properties: [
          { name: 'label', optional: false, type: { kind: 'primitive', type: 'string' } },
        ],
      },
      ctx,
      first.type,
    );
    expect(first.type).not.toBe(second.type);
    for (const name of ctx.objects.keys()) expect(modelNames.has(name)).toBe(false);
    expect(ctx.objects.get(first.type)?.fields.size).toBe(1);
    expect(ctx.objects.get(second.type)?.fields.get('label')).toBe('String!');
    const repeated = convertTypeInfoToGraphqlRef({ kind: 'object', properties: [] }, ctx, 'Score');
    expect(repeated).toEqual(first);
  });

  it('derives child names from the original hint, not the renamed parent', () => {
    const ctx = createGraphqlTypeContext(new Set(['Score']));
    const ref = convertTypeInfoToGraphqlRef(
      {
        kind: 'object',
        properties: [
          {
            name: 'detail',
            optional: false,
            type: {
              kind: 'object',
              properties: [
                { name: 'value', optional: false, type: { kind: 'primitive', type: 'number' } },
              ],
            },
          },
        ],
      },
      ctx,
      'Score',
    );
    expect(ref.type).toBe('ScoreData');
    expect(ctx.objects.get('ScoreData')?.fields.get('detail')).toBe('ScoreDetail!');
  });

  it('keeps generated object and enum names unique across every type kind and order', () => {
    const statusEnum = {
      kind: 'union',
      types: [
        { kind: 'literal', value: 'on' } as const,
        { kind: 'literal', value: 'off' } as const,
      ],
    } satisfies TypeInfo;
    const statusObject = {
      kind: 'object',
      properties: [{ name: 'ok', optional: false, type: { kind: 'primitive', type: 'boolean' } }],
    } satisfies TypeInfo;

    for (const order of ['enumFirst', 'objectFirst'] as const) {
      const ctx = createGraphqlTypeContext();
      addGraphqlField(ctx, 'Parent', 'value', { kind: 'primitive', type: 'string' });
      const refs =
        order === 'enumFirst'
          ? [
              convertTypeInfoToGraphqlRef(statusEnum, ctx, 'Status'),
              convertTypeInfoToGraphqlRef(statusObject, ctx, 'Status'),
            ]
          : [
              convertTypeInfoToGraphqlRef(statusObject, ctx, 'Status'),
              convertTypeInfoToGraphqlRef(statusEnum, ctx, 'Status'),
            ];
      const queryHinted = convertTypeInfoToGraphqlRef(statusObject, ctx, 'Query');

      const names = [
        ...ctx.objects.keys(),
        ...ctx.enums.keys(),
        ...ctx.scalars.keys(),
        ...ctx.unions.keys(),
      ];
      expect(new Set(names).size).toBe(names.length);
      expect(new Set(refs.map((r) => r.type)).size).toBe(2);
      expect(queryHinted.type).not.toBe('Query');
    }
  });

  it('rejects explicit type names already held by another type', () => {
    const ctx = createGraphqlTypeContext(new Set(['User']));
    expect(() =>
      addGraphqlField(ctx, 'User', 'name', { kind: 'primitive', type: 'string' }),
    ).toThrow(/duplicate.*type name/i);
  });

  it('converts nullable arrays and string literal unions', () => {
    const typeInfo = {
      kind: 'union',
      types: [
        {
          kind: 'array',
          items: {
            kind: 'object',
            properties: [
              {
                name: 'id',
                optional: false,
                type: { kind: 'primitive', type: 'string' },
              },
              {
                name: 'status',
                optional: false,
                type: {
                  kind: 'union',
                  types: [
                    { kind: 'literal', value: 'draft' },
                    { kind: 'literal', value: 'published' },
                  ],
                },
              },
            ],
          },
        },
        { kind: 'primitive', type: 'null' },
      ],
    } satisfies TypeInfo;

    const result = typeInfoToGraphqlType(typeInfo, 'PostPublic');

    expect(result.type).toBe('[PostPublic!]');
    expect(result.definitions).toContain(`type PostPublic {
  id: String!
  status: PostPublicStatus!
}`);
    expect(result.definitions).toContain(`enum PostPublicStatus {
  DRAFT
  PUBLISHED
}`);
  });

  it('rejects property names that are not valid GraphQL identifiers', () => {
    const typeInfo = {
      kind: 'object',
      properties: [
        {
          name: 'foo bar',
          optional: false,
          type: { kind: 'primitive', type: 'string' },
        },
      ],
    } satisfies TypeInfo;

    expect(() => typeInfoToGraphqlType(typeInfo, 'Weird')).toThrow(/field name/i);
  });

  it('rejects named types that have no registered definition', () => {
    const typeInfo = {
      kind: 'object',
      properties: [
        {
          name: 'author',
          optional: false,
          type: { kind: 'named', name: 'AuthorPublic', module: '', isExported: true },
        },
      ],
    } satisfies TypeInfo;

    expect(() => typeInfoToGraphqlType(typeInfo, 'PostPublic')).toThrow(
      /unregistered.*AuthorPublic/i,
    );
  });

  it('rejects ref types that have no registered definition', () => {
    const typeInfo = {
      kind: 'ref',
      name: 'UnknownRef',
    } satisfies TypeInfo;

    expect(() => typeInfoToGraphqlType(typeInfo, 'Hint')).toThrow(/unregistered.*UnknownRef/i);
  });

  it('rejects unknown output type', () => {
    const typeInfo = { kind: 'unknown' } satisfies TypeInfo;

    expect(() => typeInfoToGraphqlType(typeInfo, 'Hint')).toThrow(/unknown/i);
  });

  it('rejects anonymous object without a name hint', () => {
    const typeInfo = {
      kind: 'object',
      properties: [{ name: 'id', optional: false, type: { kind: 'primitive', type: 'string' } }],
    } satisfies TypeInfo;

    expect(() => typeInfoToGraphqlType(typeInfo)).toThrow(/name hint/i);
  });

  it('rejects unsupported union of mixed primitives', () => {
    const typeInfo = {
      kind: 'union',
      types: [
        { kind: 'primitive', type: 'string' },
        { kind: 'primitive', type: 'number' },
      ],
    } satisfies TypeInfo;

    expect(() => typeInfoToGraphqlType(typeInfo, 'Mixed')).toThrow(/limited/i);
  });

  it('rejects bare undefined output type', () => {
    const typeInfo = { kind: 'primitive', type: 'undefined' } satisfies TypeInfo;

    expect(() => typeInfoToGraphqlType(typeInfo, 'Hint')).toThrow(/undefined/i);
  });
});

// Public API creates a fresh context per call, so duplicate registration
// errors are only reachable through the lower-level API.
describe('typeInfoToGraphqlType internal error paths', () => {
  it('rejects duplicate enum with incompatible values', () => {
    const ctx = createGraphqlTypeContext();
    const enumA = {
      kind: 'union',
      types: [{ kind: 'literal', value: 'a' } as const, { kind: 'literal', value: 'b' } as const],
    } satisfies TypeInfo;
    const enumB = {
      kind: 'union',
      types: [{ kind: 'literal', value: 'x' } as const, { kind: 'literal', value: 'y' } as const],
    } satisfies TypeInfo;

    convertTypeInfoToGraphqlRef(enumA, ctx, 'Status');
    expect(() => convertTypeInfoToGraphqlRef(enumB, ctx, 'Status')).toThrow(/duplicate.*enum/i);
  });

  it('rejects duplicate field with incompatible type', () => {
    const ctx = createGraphqlTypeContext();
    const stringType = { kind: 'primitive', type: 'string' } satisfies TypeInfo;
    const numberType = { kind: 'primitive', type: 'number' } satisfies TypeInfo;

    addGraphqlField(ctx, 'User', 'name', stringType);
    expect(() => addGraphqlField(ctx, 'User', 'name', numberType)).toThrow(/duplicate.*field/i);
  });
});
