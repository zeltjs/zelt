import { describe, expect, it } from 'vitest';

import { runInCommandContext } from '../command-context';
import type { InferSchema } from '../schema';
import { cliSchema } from '../schema';

import { args } from './args';

const TestCommandSchema1 = cliSchema({
  args: [{ name: 'target', type: 'string' }],
  options: [{ name: 'verbose', type: 'boolean' }],
});

const TestCommandSchema2 = cliSchema({ args: [] });

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
  it('retrieves parsedArgs from context', () => {
    const TestCommand = { schema: TestCommandSchema1 };

    const ctx = { parsedArgs: { target: 'world', verbose: true } };

    const result = runInCommandContext(ctx, () => args(TestCommand));

    expect(result.target).toBe('world');
    expect(result.verbose).toBe(true);
  });

  it('throws error outside command context', () => {
    const TestCommand = { schema: TestCommandSchema2 };

    expect(() => args(TestCommand)).toThrow();
  });

  it('returns typed result matching schema', () => {
    const TestCommand = { schema: TestCommandSchema3 };

    const ctx = { parsedArgs: { target: 'x', count: 1, port: 3000, verbose: false } };
    const result = runInCommandContext(ctx, () => args(TestCommand));

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

  it('infers InferSchema correctly for the command', () => {
    const GreetCommand = { schema: GreetCommandSchema };

    type Expected = InferSchema<typeof GreetCommandSchema>;
    const ctx = { parsedArgs: { target: 'x', message: undefined, port: 3000, verbose: false } };
    const result = runInCommandContext(ctx, () => args(GreetCommand));

    const check: Expected = result;
    expect(check.target).toBe('x');
    expect(check.port).toBe(3000);
  });
});
