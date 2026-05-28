import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { valibotAdapter } from './valibot-adapter.lib';

describe('valibotAdapter', () => {
  it('converts valibot object schema to JSON Schema', () => {
    const schema = v.object({
      name: v.string(),
      age: v.number(),
    });

    const jsonSchema = valibotAdapter.toJsonSchema(schema);

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();
  });

  it('throws for non-valibot values', () => {
    const notValibot = { type: 'string' };

    expect(() => valibotAdapter.toJsonSchema(notValibot)).toThrow('Invalid valibot schema');
  });

  it('converts valibot string schema', () => {
    const schema = v.string();

    const jsonSchema = valibotAdapter.toJsonSchema(schema);

    expect(jsonSchema.type).toBe('string');
  });

  it('converts valibot array schema', () => {
    const schema = v.array(v.number());

    const jsonSchema = valibotAdapter.toJsonSchema(schema);

    expect(jsonSchema.type).toBe('array');
    expect(jsonSchema.items).toBeDefined();
  });
});
