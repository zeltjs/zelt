import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { valibotAdapter } from './adapter';

describe('valibotAdapter', () => {
  it('converts valibot schema to JSON Schema', () => {
    const schema = v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      age: v.pipe(v.number(), v.minValue(0)),
    });

    const jsonSchema = valibotAdapter.toJsonSchema(schema);

    expect(jsonSchema).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'number', minimum: 0 },
      },
      required: ['name', 'age'],
    });
  });

  it('throws for invalid schema input', () => {
    expect(() => valibotAdapter.toJsonSchema('not a schema')).toThrow();
  });

  it('throws when passed a plain object that mimics schema shape', () => {
    expect(() =>
      valibotAdapter.toJsonSchema({ kind: 'schema', type: 'string', async: false }),
    ).toThrow();
  });
});
