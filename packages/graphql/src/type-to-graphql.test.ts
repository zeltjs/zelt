import type { TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';

import { typeInfoToGraphqlType } from './type-to-graphql.lib';

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
});
