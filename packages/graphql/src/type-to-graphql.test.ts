import type { TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';

import {
  addGraphqlField,
  convertTypeInfoToGraphqlRef,
  createGraphqlTypeContext,
  typeInfoToGraphqlType,
} from './type-to-graphql.lib';

describe('typeInfoToGraphqlType', () => {
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
