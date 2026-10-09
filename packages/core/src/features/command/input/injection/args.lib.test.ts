import { describe, expect, it } from 'vitest';

import { ZeltCommandExecutionError, ZeltContextNotAvailableError } from '../../../../kernel';
import type { InferSchema } from '../command-schema.types';
import { cliSchema, runInCommandContext } from '../index';

import { args } from './args.lib';

const TestCommandSchema1 = cliSchema({
  args: [{ name: 'target', type: 'string' }],
  options: [{ name: 'verbose', type: 'boolean' }],
});

const TestCommandSchema3 = cliSchema({
  args: [
    { name: 'target', type: 'string' },
    { name: 'count', type: 'number' },
  ],
  options: [
    { name: 'port', type: 'number', default: 3000 },
    { name: 'verbose', type: 'boolean' },
  ],
});

const GreetCommandSchema = cliSchema({
  args: [
    { name: 'target', type: 'string' },
    { name: 'message', type: 'string', optional: true },
  ],
  options: [
    { name: 'port', type: 'number', default: 3000 },
    { name: 'verbose', type: 'boolean', alias: 'v' },
  ],
});

describe('args()', () => {
  it('parses argv from context according to the given schema', () => {
    const ctx = { commandName: 'test', argv: ['world', '--verbose'] };

    const result = runInCommandContext(ctx, () => args(TestCommandSchema1));

    expect(result.target).toBe('world');
    expect(result.verbose).toBe(true);
  });

  it('throws ZeltContextNotAvailableError outside command context', () => {
    expect(() => args(TestCommandSchema1)).toThrow(ZeltContextNotAvailableError);
  });

  it('throws ZeltCommandExecutionError with reason argv_parse_error on parse failure', () => {
    const ctx = { commandName: 'test', argv: [] };

    expect(() => runInCommandContext(ctx, () => args(TestCommandSchema1))).toThrow(
      ZeltCommandExecutionError,
    );

    try {
      runInCommandContext(ctx, () => args(TestCommandSchema1));
      throw new Error('expected args() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ZeltCommandExecutionError);
      const commandError = e as ZeltCommandExecutionError;
      expect(commandError.context.reason).toBe('argv_parse_error');
      expect(commandError.context.commandName).toBe('test');
    }
  });

  it('returns typed result matching schema', () => {
    const ctx = { commandName: 'test', argv: ['x', '1', '--port', '3000', '--verbose=false'] };
    const result = runInCommandContext(ctx, () => args(TestCommandSchema3));

    const check: {
      target: string;
      count: number;
      port: number;
      verbose: boolean;
    } = result;

    expect(check.target).toBe('x');
    expect(check.count).toBe(1);
    expect(check.port).toBe(3000);
    expect(check.verbose).toBe(false);
  });

  it('infers InferSchema correctly for the schema', () => {
    type Expected = InferSchema<typeof GreetCommandSchema>;
    const ctx = { commandName: 'greet', argv: ['x', '--port', '3000'] };
    const result = runInCommandContext(ctx, () => args(GreetCommandSchema));

    const check: Expected = result;
    expect(check.target).toBe('x');
    expect(check.port).toBe(3000);
  });
});
