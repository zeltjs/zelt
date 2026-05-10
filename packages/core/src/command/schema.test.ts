import { describe, expect, it } from 'vitest';

import { cliSchema, type InferSchema } from './schema';

describe('cliSchema', () => {
  it('returns input unchanged', () => {
    const schema = cliSchema({
      args: [{ name: 'target', type: 'string' }],
      options: [{ name: 'verbose', type: 'boolean' }],
    });

    expect(schema.args).toEqual([{ name: 'target', type: 'string' }]);
    expect(schema.options).toEqual([{ name: 'verbose', type: 'boolean' }]);
  });

  it('preserves literal types without as const', () => {
    const _schema = cliSchema({
      args: [{ name: 'target', type: 'string' }],
    });

    type Result = InferSchema<typeof _schema>;
    const check: Result = { target: 'test' };
    expect(check.target).toBe('test');
  });

  it('infers optional arg as T | undefined', () => {
    const _schema = cliSchema({
      args: [{ name: 'message', type: 'string', optional: true }],
    });

    type Result = InferSchema<typeof _schema>;
    const check: Result = { message: undefined };
    expect(check.message).toBeUndefined();
  });

  it('infers number arg correctly', () => {
    const _schema = cliSchema({
      args: [{ name: 'count', type: 'number' }],
    });

    type Result = InferSchema<typeof _schema>;
    const check: Result = { count: 42 };
    expect(check.count).toBe(42);
  });

  it('infers boolean option as boolean (not undefined)', () => {
    const _schema = cliSchema({
      options: [{ name: 'verbose', type: 'boolean' }],
    });

    type Result = InferSchema<typeof _schema>;
    const check: Result = { verbose: true };
    expect(check.verbose).toBe(true);
  });

  it('infers string option without default as string | undefined', () => {
    type Result = InferSchema<
      ReturnType<typeof cliSchema<{ options: [{ name: 'env'; type: 'string' }] }>>
    >;
    const check: Result = { env: undefined };
    expect(check.env).toBeUndefined();
  });

  it('infers option with default as non-undefined', () => {
    type Result = InferSchema<
      ReturnType<typeof cliSchema<{ options: [{ name: 'port'; type: 'number'; default: 3000 }] }>>
    >;
    const check: Result = { port: 8080 };
    expect(check.port).toBe(8080);
  });

  it('infers combined args and options', () => {
    const _schema = cliSchema({
      args: [
        { name: 'target', type: 'string' },
        { name: 'message', type: 'string', optional: true },
      ],
      options: [
        { name: 'port', type: 'number', default: 3000 },
        { name: 'verbose', type: 'boolean', alias: 'v' },
      ],
    });

    type Result = InferSchema<typeof _schema>;
    const check: Result = { target: 'x', message: undefined, port: 3000, verbose: false };
    expect(check.target).toBe('x');
    expect(check.port).toBe(3000);
    expect(check.verbose).toBe(false);
  });

  it('infers empty schema as empty object', () => {
    const _emptySchema = cliSchema({});
    type Result = InferSchema<typeof _emptySchema>;
    const check: Result = {};
    expect(check).toEqual({});
  });
});
