import { Container } from '@needle-di/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CommandInputSchema, InferSchema } from '../../../index';
import {
  args,
  Command,
  cliSchema,
  cliUnion,
  command,
  Injectable,
  inject,
  ZeltAppConfigurationError,
} from '../../../index';
import { bindCommandInput } from './bind-command-input.lib';

const execute = async <S extends CommandInputSchema>(schema: S, tokens: readonly string[]) => {
  const received: InferSchema<S>[] = [];
  @Command({ name: 'probe' })
  class ProbeCommand {
    run(input = args(schema)) {
      received.push(input);
    }
  }
  const container = new Container();
  const capabilities = await command([ProbeCommand]).realize({
    get: async <T extends object>(cls: new (...values: never[]) => T): Promise<T> =>
      container.get(cls),
    registerShutdown: (callback) => async () => callback(),
  });
  const result = await capabilities.execCommand(['probe', ...tokens]);
  return { result, received };
};

const snapshot = cliSchema({ options: [{ name: 'snapshot', type: 'string', required: true }] });
const directories = cliSchema({
  args: [{ name: 'directories', type: 'string', variadic: { min: 0 } }],
  options: [{ name: 'base', type: 'string' }],
});
const config = cliSchema({
  options: [
    { name: 'config', type: 'string', required: true },
    { name: 'base', type: 'string' },
  ],
});
const serveSchema = cliUnion([snapshot, directories, config]);

const success = (
  tokens: readonly string[],
  schema: CommandInputSchema,
): Record<string, unknown> => {
  const result = bindCommandInput(tokens, schema);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.parsed;
};

describe('required command options', () => {
  const schema = cliSchema({
    options: [
      { name: 'snapshot', type: 'string', required: true, alias: 's' },
      { name: 'guide', type: 'string', required: true, alias: 'g' },
    ],
  });

  it.each([
    ['--snapshot', 'snapshot.json', '--guide', 'guide.json'],
    ['--guide', 'guide.json', '--snapshot', 'snapshot.json'],
    ['-s', 'snapshot.json', '-g', 'guide.json'],
    ['--snapshot=snapshot.json', '--guide=guide.json'],
  ])('accepts supplied required options through names or aliases: %j', (...tokens) => {
    expect(success(tokens, schema)).toEqual({ snapshot: 'snapshot.json', guide: 'guide.json' });
  });

  it.each([
    ['--snapshot', 'snapshot.json'],
    ['--snapshot', 'snapshot.json', '--guide'],
    ['--guide', '--snapshot', 'snapshot.json'],
    ['--snapshot', 'snapshot.json', '--guide', 'guide.json', 'extra'],
  ])('rejects invalid input before entering run: %j', async (...tokens) => {
    const { result, received } = await execute(schema, tokens);
    expect(received).toEqual([]);
    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) expect(result.reason.context.reason).toBe('argv_parse_error');
  });

  it('accepts an explicitly supplied empty string', () => {
    expect(success(['--snapshot=', '--guide='], schema)).toEqual({ snapshot: '', guide: '' });
  });

  it('requires explicit boolean presence even when its value is false', () => {
    const requiredFlag = cliSchema({
      options: [{ name: 'confirm', type: 'boolean', required: true }],
    });
    expect(bindCommandInput([], requiredFlag)).toMatchObject({
      ok: false,
      error: 'Missing required option: --confirm',
    });
    expect(success(['--confirm=false'], requiredFlag)).toEqual({ confirm: false });
  });

  it('rejects invalid numeric values and accepts required numeric aliases', () => {
    const numeric = cliSchema({
      options: [{ name: 'port', type: 'number', alias: 'p', required: true }],
    });
    expect(success(['-p', '3000'], numeric)).toEqual({ port: 3000 });
    for (const token of ['invalid', 'NaN', 'Infinity']) {
      expect(bindCommandInput([`--port=${token}`], numeric)).toMatchObject({ ok: false });
    }
    expect(bindCommandInput([], numeric)).toMatchObject({ ok: false });
  });
});

describe('variadic command arguments', () => {
  const bounded = cliSchema({
    args: [{ name: 'values', type: 'number', variadic: { min: 1, max: 3 } }],
  });

  it('collects every remaining argument in order after fixed arguments', () => {
    const schema = cliSchema({
      args: [
        { name: 'output', type: 'string' },
        { name: 'directories', type: 'string', variadic: { min: 1 } },
      ],
    });
    expect(success(['report.json', 'src', 'packages/a', 'packages/b'], schema)).toEqual({
      output: 'report.json',
      directories: ['src', 'packages/a', 'packages/b'],
    });
  });

  it.each([
    [],
    ['1', '2', '3', '4'],
    ['1', 'bad'],
    ['Infinity'],
  ])('rejects invalid counts or elements: %j', (...tokens) => {
    expect(bindCommandInput(tokens, bounded)).toMatchObject({ ok: false });
  });

  it.each([['1'], ['1', '2', '3']])('accepts the count boundaries: %j', (...tokens) => {
    expect(success(tokens, bounded)).toEqual({ values: tokens.map(Number) });
  });

  it('supports an empty array, default bounds, and a zero maximum', () => {
    const unbounded = cliSchema({ args: [{ name: 'directories', type: 'string', variadic: {} }] });
    expect(success([], unbounded)).toEqual({ directories: [] });
    expect(success(['src', 'a', 'b', 'c'], unbounded)).toEqual({
      directories: ['src', 'a', 'b', 'c'],
    });
    const zero = cliSchema({ args: [{ name: 'values', type: 'string', variadic: { max: 0 } }] });
    expect(success([], zero)).toEqual({ values: [] });
    expect(bindCommandInput(['x'], zero)).toMatchObject({ ok: false });
  });

  it('does not reassign an optional fixed argument to satisfy min', () => {
    const schema = cliSchema({
      args: [
        { name: 'output', type: 'string', optional: true },
        { name: 'directories', type: 'string', variadic: { min: 1 } },
      ],
    });
    expect(bindCommandInput(['src'], schema)).toMatchObject({ ok: false });
  });
});

describe('command input unions', () => {
  it.each([
    { tokens: ['--snapshot', 'saved.json'], value: { snapshot: 'saved.json' } },
    { tokens: ['src', 'packages/a'], value: { directories: ['src', 'packages/a'] } },
    { tokens: ['src', '--base', 'main'], value: { directories: ['src'], base: 'main' } },
    {
      tokens: ['--config', 'pathdency.json', '--base', 'main'],
      value: { config: 'pathdency.json', base: 'main' },
    },
    { tokens: [], value: { directories: [] } },
    { tokens: ['--base', 'main'], value: { directories: [], base: 'main' } },
  ])('selects the complete valid input: $tokens', async ({ tokens, value }) => {
    const { result, received } = await execute(serveSchema, tokens);
    expect(result).toEqual({ exitCode: 0 });
    expect(received).toEqual([value]);
    expect(success(tokens, cliUnion([config, directories, snapshot]))).toEqual(value);
  });

  it.each([
    ['--snapshot', 'saved.json', '--base', 'main'],
    ['--base', 'main', '--snapshot', 'saved.json'],
    ['--snapshot', 'saved.json', 'src'],
    ['src', '--config', 'pathdency.json'],
    ['--config', 'pathdency.json', 'src'],
    ['--snapshot', 'saved.json', '--config', 'pathdency.json'],
    ['--snapshop', 'saved.json'],
  ])('rejects combinations outside every branch: %j', async (...tokens) => {
    const { result, received } = await execute(serveSchema, tokens);
    expect(received).toEqual([]);
    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.reason.context.reason).toBe('argv_parse_error');
      expect(result.reason.context.details).toContain('Alternative');
      expect(result.reason.context.details).toContain('--');
    }
  });

  it('rejects ambiguity independent of branch order', () => {
    const a = cliSchema({ options: [{ name: 'a', type: 'string' }] });
    const b = cliSchema({ options: [{ name: 'b', type: 'string' }] });
    for (const branches of [
      [a, b],
      [b, a],
    ] as const) {
      expect(bindCommandInput([], cliUnion(branches))).toMatchObject({
        ok: false,
        error: expect.stringContaining('Ambiguous'),
      });
    }
  });

  it('keeps defaults within their selected branch', () => {
    const schema = cliUnion([
      snapshot,
      cliSchema({
        args: [{ name: 'directories', type: 'string', variadic: { min: 0 } }],
        options: [{ name: 'base', type: 'string', default: 'main' }],
      }),
    ]);
    expect(success(['--snapshot', 'saved.json'], schema)).toEqual({ snapshot: 'saved.json' });
    expect(success([], schema)).toEqual({ directories: [], base: 'main' });
    expect(success(['--snapshot', 'saved.json'], schema)).toEqual({ snapshot: 'saved.json' });
  });

  it('preserves constructor DI and run default-parameter inference', async () => {
    @Injectable()
    class Observer {
      readonly inputs: unknown[] = [];
    }
    @Command({ name: 'serve' })
    class ServeCommand {
      constructor(private readonly observer = inject(Observer)) {}
      run(input = args(serveSchema)) {
        if (input.snapshot !== undefined) expectTypeOf(input.snapshot).toEqualTypeOf<string>();
        else if (input.config !== undefined) expectTypeOf(input.config).toEqualTypeOf<string>();
        else expectTypeOf(input.directories).toEqualTypeOf<string[]>();
        this.observer.inputs.push(input);
      }
    }
    const container = new Container();
    const caps = await command([ServeCommand]).realize({
      get: async <T extends object>(cls: new (...values: never[]) => T): Promise<T> =>
        container.get(cls),
      registerShutdown: (callback) => async () => callback(),
    });
    expect(await caps.execCommand(['serve', '--snapshot', 'saved.json'])).toEqual({ exitCode: 0 });
    expect(await caps.execCommand(['serve', 'src'])).toEqual({ exitCode: 0 });
    expect(container.get(Observer).inputs).toEqual([
      { snapshot: 'saved.json' },
      { directories: ['src'] },
    ]);
  });
});

describe('strict command input validation', () => {
  it.each([
    ['--unknown'],
    ['--unknown=value'],
    ['-x'],
    ['ignored'],
  ])('rejects undeclared input in an empty schema: %j', (...tokens) => {
    expect(bindCommandInput(tokens, cliSchema({}))).toMatchObject({ ok: false });
  });

  it('rejects an excess fixed argument and reports allowed and actual counts', () => {
    const schema = cliSchema({ args: [{ name: 'first', type: 'string' }] });
    expect(bindCommandInput(['first', 'second'], schema)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/allowed 1; received 2/),
    });
  });

  it('treats tokens after -- as positional input, subject to count validation', () => {
    expect(success(['--', '--unknown', '-x'], directories)).toEqual({
      directories: ['--unknown', '-x'],
    });
    expect(bindCommandInput(['--', '--unknown'], cliSchema({}))).toMatchObject({ ok: false });
  });

  it('does not mistake inherited object keys for explicitly supplied options', () => {
    const schema = cliSchema({
      options: [{ name: 'constructor', type: 'string', required: true }],
    });
    expect(bindCommandInput([], schema)).toMatchObject({ ok: false });
    expect(success(['--constructor', 'value'], schema)).toEqual({ constructor: 'value' });
  });

  it('reports an invalid mutated schema as a declaration error', async () => {
    const schema: { options: { name: string; type: 'string' }[] } = {
      options: [{ name: 'x', type: 'string' }],
    };
    cliSchema(schema);
    schema.options.push({ name: 'x', type: 'string' });
    const { result, received } = await execute(schema, []);
    expect(received).toEqual([]);
    if (result.exitCode !== 1) throw new Error('Expected invalid schema to fail');
    expect(result.reason.context.reason).toBe('run_error');
    expect(result.reason.cause).toBeInstanceOf(ZeltAppConfigurationError);
  });
});
