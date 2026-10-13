import { describe, expect, expectTypeOf, it } from 'vitest';
import { ZeltAppConfigurationError } from '../../../kernel';
import { bindCommandInput } from './bind-command-input.lib';
import { cliSchema, cliUnion } from './command-schema.lib';
import type { CommandInputSchema, InferSchema, SchemaDefinition } from './command-schema.types';

// These examples are checked by tsc, without executing invalid declarations.
const invalidDeclarations = () => {
  cliSchema({
    // @ts-expect-error required and default express incompatible contracts
    options: [{ name: 'guide', type: 'string', required: true, default: 'guide.json' }],
  });
  // @ts-expect-error defaults must match their declared type
  cliSchema({ options: [{ name: 'port', type: 'number', default: '3000' }] });
  // @ts-expect-error variadic arguments use min rather than optional
  cliSchema({ args: [{ name: 'dirs', type: 'string', variadic: {}, optional: true }] });
  // @ts-expect-error variadic argument must be last
  cliSchema({
    args: [
      { name: 'dirs', type: 'string', variadic: {} },
      { name: 'file', type: 'string' },
    ],
  });
  // @ts-expect-error duplicate output names
  cliSchema({
    args: [{ name: 'file', type: 'string' }],
    options: [{ name: 'file', type: 'string' }],
  });
  // @ts-expect-error alias collides with another long option name
  cliSchema({
    options: [
      { name: 'verbose', type: 'boolean', alias: 'v' },
      { name: 'v', type: 'boolean' },
    ],
  });
  // @ts-expect-error aliases must be unique
  cliSchema({
    options: [
      { name: 'verbose', type: 'boolean', alias: 'v' },
      { name: 'version', type: 'boolean', alias: 'v' },
    ],
  });
  // @ts-expect-error a union requires two alternatives
  cliUnion([cliSchema({})]);
  cliUnion([
    // @ts-expect-error inline union branches must also be valid
    {
      options: [
        { name: 'a', type: 'string' },
        { name: 'a', type: 'string' },
      ],
    },
    {},
  ]);
};
void invalidDeclarations;

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
const _union = cliUnion([snapshot, directories, config]);

const narrowInput = (input: InferSchema<typeof _union>) => {
  if (input.snapshot !== undefined) {
    expectTypeOf(input.snapshot).toEqualTypeOf<string>();
    expectTypeOf(input.base).toEqualTypeOf<undefined>();
    expectTypeOf(input.config).toEqualTypeOf<undefined>();
  } else if (input.config !== undefined) {
    expectTypeOf(input.config).toEqualTypeOf<string>();
    expectTypeOf(input.base).toEqualTypeOf<string | undefined>();
    expectTypeOf(input.directories).toEqualTypeOf<undefined>();
  } else {
    expectTypeOf(input.directories).toEqualTypeOf<string[]>();
    expectTypeOf(input.base).toEqualTypeOf<string | undefined>();
  }
};
void narrowInput;

const invalidInputTypes = () => {
  // @ts-expect-error union cannot mix branch inputs
  const mixed: InferSchema<typeof _union> = { snapshot: 'saved.json', base: 'main' };
  void mixed;
};
void invalidInputTypes;

describe('command schema contracts', () => {
  it('infers required options and variadic arrays', () => {
    const _schema = cliSchema({
      options: [
        { name: 'guide', type: 'string', required: true },
        { name: 'port', type: 'number', required: true },
      ],
      args: [{ name: 'values', type: 'number', variadic: { min: 1, max: 3 } }],
    });
    expectTypeOf<InferSchema<typeof _schema>>().toEqualTypeOf<
      { guide: string; port: number } & { values: number[] }
    >();
  });

  it.each([
    {
      options: [
        { name: 'a', type: 'string' },
        { name: 'a', type: 'string' },
      ],
    },
    {
      options: [
        { name: 'a', type: 'string', alias: 'b' },
        { name: 'b', type: 'string' },
      ],
    },
    { options: [{ name: 'a', type: 'string', required: true, default: 'x' }] },
    { options: [{ name: 'a', type: 'number', default: 'x' }] },
    { options: [{ name: 'a', type: 'number', default: Infinity }] },
    {
      args: [
        { name: 'a', type: 'string', variadic: {} },
        { name: 'b', type: 'string' },
      ],
    },
    { args: [{ name: 'a', type: 'string', variadic: {}, optional: true }] },
    ...[-1, 0.5, Infinity, NaN, null].map((min) => ({
      args: [{ name: 'a', type: 'string', variadic: { min } }],
    })),
    ...[-1, 0.5, Infinity, NaN].map((max) => ({
      args: [{ name: 'a', type: 'string', variadic: { max } }],
    })),
    { args: [{ name: 'a', type: 'string', variadic: { min: 2, max: 1 } }] },
  ])('rejects invalid dynamic declarations: %j', (definition) => {
    const schema = definition as SchemaDefinition;
    expect(() => cliSchema(schema)).toThrow(ZeltAppConfigurationError);
    const result = bindCommandInput([], schema);
    expect(result).toMatchObject({ ok: false, kind: 'schema' });
  });

  it('rejects invalid branches before choosing a valid branch', () => {
    const bad = {
      kind: 'union',
      schemas: [snapshot, { options: [{ name: 'x', type: 'number', default: 'bad' }] }],
    } as unknown as CommandInputSchema;
    expect(bindCommandInput(['--snapshot', 'saved.json'], bad)).toMatchObject({
      ok: false,
      kind: 'schema',
    });
  });

  it('rejects a dynamic union with fewer than two branches', () => {
    const bad = { kind: 'union', schemas: [snapshot] } as const;
    expect(bindCommandInput(['--snapshot', 'saved.json'], bad)).toMatchObject({
      ok: false,
      kind: 'schema',
    });
  });

  it('preserves schema identity and does not mutate declarations or argv', () => {
    const schema = Object.freeze({
      args: Object.freeze([
        { name: 'directories', type: 'string', variadic: Object.freeze({ min: 0 }) } as const,
      ]),
    });
    expect(cliSchema(schema)).toBe(schema);
    const tokens = Object.freeze(['src', 'packages/a']);
    expect(bindCommandInput(tokens, schema)).toMatchObject({
      ok: true,
      parsed: { directories: ['src', 'packages/a'] },
    });
    expect(tokens).toEqual(['src', 'packages/a']);
  });
});
