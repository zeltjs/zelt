import { describe, expect, it } from 'vitest';

import { jsonSchemaToGraphqlArgs, renderGraphqlArgs } from './json-schema-to-graphql-args.lib';

describe('jsonSchemaToGraphqlArgs', () => {
  it('maps top-level properties to GraphQL args with required markers', () => {
    const args = jsonSchemaToGraphqlArgs({
      type: 'object',
      properties: {
        id: { type: 'string' },
        quantity: { type: 'integer' },
        rating: { type: 'number' },
        active: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'quantity'],
    });

    expect(renderGraphqlArgs(args)).toBe(
      '(id: String!, quantity: Int!, rating: Float, active: Boolean, tags: [String!])',
    );
  });

  it('throws for a non-object top-level schema', () => {
    expect(() => jsonSchemaToGraphqlArgs({ type: 'string' })).toThrow(/top-level object/i);
  });

  it('throws for unsupported property types instead of guessing', () => {
    expect(() =>
      jsonSchemaToGraphqlArgs({
        type: 'object',
        properties: { nested: { type: 'object', properties: {} } },
        required: ['nested'],
      }),
    ).toThrow(/unsupported/i);
  });
});
