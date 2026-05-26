import type { TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';

import { typeInfoToJsonSchema } from '../type-to-schema';

describe('typeInfoToJsonSchema', () => {
  describe('primitives', () => {
    it('converts string', () => {
      const type: TypeInfo = { kind: 'primitive', type: 'string' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'string' });
    });

    it('converts number', () => {
      const type: TypeInfo = { kind: 'primitive', type: 'number' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'number' });
    });

    it('converts boolean', () => {
      const type: TypeInfo = { kind: 'primitive', type: 'boolean' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'boolean' });
    });

    it('converts null', () => {
      const type: TypeInfo = { kind: 'primitive', type: 'null' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'null' });
    });

    it('converts undefined', () => {
      const type: TypeInfo = { kind: 'primitive', type: 'undefined' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'undefined' });
    });
  });

  describe('literals', () => {
    it('converts string literal', () => {
      const type: TypeInfo = { kind: 'literal', value: 'hello' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ const: 'hello' });
    });

    it('converts number literal', () => {
      const type: TypeInfo = { kind: 'literal', value: 42 };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ const: 42 });
    });

    it('converts boolean literal', () => {
      const type: TypeInfo = { kind: 'literal', value: true };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ const: true });
    });
  });

  describe('array', () => {
    it('converts array of primitives', () => {
      const type: TypeInfo = {
        kind: 'array',
        items: { kind: 'primitive', type: 'string' },
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('converts nested arrays', () => {
      const type: TypeInfo = {
        kind: 'array',
        items: { kind: 'array', items: { kind: 'primitive', type: 'number' } },
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        type: 'array',
        items: { type: 'array', items: { type: 'number' } },
      });
    });
  });

  describe('object', () => {
    it('converts object with required properties', () => {
      const type: TypeInfo = {
        kind: 'object',
        properties: [
          { name: 'id', type: { kind: 'primitive', type: 'number' }, optional: false },
          { name: 'name', type: { kind: 'primitive', type: 'string' }, optional: false },
        ],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      });
    });

    it('converts object with optional properties', () => {
      const type: TypeInfo = {
        kind: 'object',
        properties: [
          { name: 'id', type: { kind: 'primitive', type: 'number' }, optional: false },
          { name: 'email', type: { kind: 'primitive', type: 'string' }, optional: true },
        ],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        type: 'object',
        properties: {
          id: { type: 'number' },
          email: { type: 'string' },
        },
        required: ['id'],
      });
    });

    it('omits required array when all properties are optional', () => {
      const type: TypeInfo = {
        kind: 'object',
        properties: [{ name: 'name', type: { kind: 'primitive', type: 'string' }, optional: true }],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
    });
  });

  describe('union', () => {
    it('converts nullable type (T | null)', () => {
      const type: TypeInfo = {
        kind: 'union',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'null' },
        ],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'string', nullable: true });
    });

    it('converts optional type (T | undefined)', () => {
      const type: TypeInfo = {
        kind: 'union',
        types: [
          { kind: 'primitive', type: 'number' },
          { kind: 'primitive', type: 'undefined' },
        ],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'number', nullable: true });
    });

    it('converts union of multiple types', () => {
      const type: TypeInfo = {
        kind: 'union',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'number' },
        ],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }],
      });
    });

    it('converts union of multiple non-null types with null', () => {
      const type: TypeInfo = {
        kind: 'union',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'number' },
          { kind: 'primitive', type: 'null' },
        ],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
      });
    });

    it('converts union of multiple types with undefined', () => {
      const type: TypeInfo = {
        kind: 'union',
        types: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'number' },
          { kind: 'primitive', type: 'undefined' },
        ],
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'undefined' }],
      });
    });
  });

  describe('named types', () => {
    it('converts named type to $ref', () => {
      const type: TypeInfo = {
        kind: 'named',
        name: 'User',
        module: '/path/to/user.ts',
        isExported: true,
      };
      const { schema, namedTypes } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ $ref: '#/components/schemas/User' });
      expect(namedTypes).toEqual(['User']);
    });

    it('converts ref type to $ref', () => {
      const type: TypeInfo = { kind: 'ref', name: 'Todo' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ $ref: '#/components/schemas/Todo' });
    });
  });

  describe('promise', () => {
    it('unwraps promise type', () => {
      const type: TypeInfo = {
        kind: 'promise',
        inner: { kind: 'primitive', type: 'string' },
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({ type: 'string' });
    });
  });

  describe('unknown', () => {
    it('converts unknown to empty schema', () => {
      const type: TypeInfo = { kind: 'unknown' };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({});
    });
  });

  describe('complex nested types', () => {
    it('converts array of objects', () => {
      const type: TypeInfo = {
        kind: 'array',
        items: {
          kind: 'object',
          properties: [
            { name: 'id', type: { kind: 'primitive', type: 'number' }, optional: false },
            { name: 'title', type: { kind: 'primitive', type: 'string' }, optional: false },
          ],
        },
      };
      const { schema } = typeInfoToJsonSchema(type);
      expect(schema).toEqual({
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            title: { type: 'string' },
          },
          required: ['id', 'title'],
        },
      });
    });

    it('collects multiple named types', () => {
      const type: TypeInfo = {
        kind: 'object',
        properties: [
          {
            name: 'user',
            type: { kind: 'named', name: 'User', module: '/path/to/user.ts', isExported: true },
            optional: false,
          },
          {
            name: 'posts',
            type: {
              kind: 'array',
              items: { kind: 'named', name: 'Post', module: '/path/to/post.ts', isExported: true },
            },
            optional: false,
          },
        ],
      };
      const { namedTypes } = typeInfoToJsonSchema(type);
      expect(namedTypes).toContain('User');
      expect(namedTypes).toContain('Post');
    });
  });
});
