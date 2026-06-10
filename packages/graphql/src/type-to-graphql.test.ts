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
});
