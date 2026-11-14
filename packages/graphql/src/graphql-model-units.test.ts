import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import { readModelDeclaration } from './graphql-model-declaration.lib';
import { readPerParent } from './graphql-model-per-parent.lib';
import { readPick } from './graphql-model-pick.lib';
import { readReference } from './graphql-model-reference.lib';
import { readSupply } from './graphql-model-supply.lib';
import { readModelValue } from './graphql-model-value.lib';

// Each unit reads one user-written form. The fixtures write the form as the type of a property,
// as resolver signatures do, so an alias around the form itself never sneaks in.
const PRELUDE = `
type ID = string & { __zeltGraphqlScalar?: 'ID' };
type Thing = { readonly id: ID; readonly label: string; readonly $code: string };
type Other = { readonly id: string };
type ThingRef = Pick<Thing, 'id'>;
type Identity<T> = T;
type RefOf<Model extends { readonly id: string }> = Pick<Model, 'id'>;
`;

const FILE = '/virtual/subject.ts';

type Subject = {
  readonly type: ts.Type;
  readonly thing: ts.Type;
  readonly reader: ModelTypeReader;
};

const read = (form: string): Subject => {
  const text = `${PRELUDE}\nexport type Subject = { subject: ${form} };\nexport type ThingType = Thing;`;
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, ...rest) =>
    name === FILE
      ? ts.createSourceFile(name, text, language, true)
      : getSourceFile(name, language, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === FILE || fileExists(name);
  const program = ts.createProgram([FILE], options, host);
  const checker = program.getTypeChecker();
  const alias = (name: string): ts.Type => {
    const statement = program
      .getSourceFile(FILE)
      ?.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name);
    if (!statement) throw new Error(`missing ${name}`);
    return checker.getTypeAtLocation(statement);
  };
  const subject = checker.getPropertyOfType(alias('Subject'), 'subject');
  if (!subject) throw new Error('missing subject');
  return {
    type: checker.getTypeOfSymbol(subject),
    thing: alias('ThingType'),
    reader: { checker, ts },
  };
};

const outcome = (result: { readonly kind: string; readonly reason?: string }): string =>
  result.kind === 'rejected' ? `rejected: ${result.reason ?? ''}` : result.kind;

describe('Pick<Model, keys>', () => {
  it.each([
    ["Pick<Thing, 'id'>", 'ok'],
    ["Pick<Thing, 'id' | 'label'>", 'ok'],
    ["Identity<Pick<Thing, 'id'>>", 'ok'],
    ['ThingRef', 'ok'],
    ['RefOf<Thing>', 'ok'],
    ['Thing', 'absent'],
    ['{ id: string }', 'absent'],
  ])('%s → %s', (form, expected) => {
    const { type, reader } = read(form);
    expect(outcome(readPick(type, reader))).toBe(expected);
  });
});

describe('Pick<Model, keys> selection', () => {
  it.each([
    ["Pick<Thing, 'id' | 'label'>", ['id', 'label']],
    ['ThingRef', ['id']],
    ['RefOf<Thing>', ['id']],
    ["Identity<Pick<Thing, '$code'>>", ['$code']],
  ])('%s picks %o from Thing', (form, keys) => {
    const { type, thing, reader } = read(form);
    expect(readPick(type, reader)).toEqual({ kind: 'ok', value: { model: thing, keys } });
  });
});

describe('model reference', () => {
  it.each([
    ["Pick<Thing, 'id'>", { kind: 'one', nullable: false }],
    ["Pick<Thing, 'id'> | null", { kind: 'one', nullable: true }],
    ['readonly ThingRef[]', { kind: 'many', nullable: false, itemNullable: false }],
    [
      "readonly (Pick<Thing, 'id'> | null)[]",
      { kind: 'many', nullable: false, itemNullable: true },
    ],
  ])('%s has shape %o', (form, shape) => {
    const { type, reader } = read(form);
    expect(readReference(type, reader)).toMatchObject({ kind: 'ok', value: { shape } });
  });

  it.each([
    [
      "Pick<Thing, 'id'> | undefined",
      'rejected: references cannot be undefined; return null instead',
    ],
    [
      "readonly (Pick<Thing, 'id'> | undefined)[]",
      'rejected: references cannot be undefined; return null instead',
    ],
    [
      "Pick<Thing, 'id' | 'label'>",
      'rejected: must return Pick<Model, \'id\'>, an array of it, or a nullable form; got Pick<Thing, "id" | "label">',
    ],
    ['string', 'absent'],
  ])('%s → %s', (form, expected) => {
    const { type, reader } = read(form);
    expect(outcome(readReference(type, reader))).toBe(expected);
  });
});

describe('result per parent', () => {
  const batch = (form: string) => {
    const { type, thing, reader } = read(form);
    return readPerParent(type, { ref: { model: thing, keys: ['id'] }, batch: true }, reader);
  };

  it.each([
    ["ReadonlyMap<Thing['id'], string>", 'ok'],
    ["Map<Thing['id'], string>", 'ok'],
    [
      '{ get(key: string): string }',
      'rejected: batch methods must return a Map or ReadonlyMap keyed by parent id',
    ],
    ['ReadonlyMap<number, string>', 'rejected: Map key must match model id type'],
    ["ReadonlyMap<Thing['id'], Promise<string>>", 'rejected: batch Map values cannot be Promise'],
  ])('%s → %s', (form, expected) => {
    expect(outcome(batch(form))).toBe(expected);
  });

  it('is the return value itself for a single parent', () => {
    const { type, thing, reader } = read('string');
    expect(
      readPerParent(type, { ref: { model: thing, keys: ['id'] }, batch: false }, reader),
    ).toEqual({
      kind: 'ok',
      value: type,
    });
  });
});

describe('provider supply', () => {
  it.each([
    ['Thing', ['id', 'label', '$code']],
    ["Pick<Thing, 'id' | '$code'>", ['id', '$code']],
    ["Pick<Thing, 'label'>", ['label']],
  ])('%s supplies %o', (form, keys) => {
    const { type, thing, reader } = read(form);
    expect(readSupply(type, thing, reader)).toEqual({ kind: 'ok', value: keys });
  });

  it.each([
    [
      'Thing | null',
      'rejected: provider result cannot be null; throw when a requested id has no data',
    ],
    ['Thing | undefined', 'rejected: provider result must be Model or Pick<Model, keys>'],
    ["Pick<Other, 'id'>", 'rejected: provider result must be Model or Pick<Model, keys>'],
  ])('%s → %s', (form, expected) => {
    const { type, thing, reader } = read(form);
    expect(outcome(readSupply(type, thing, reader))).toBe(expected);
  });
});

describe('model property value', () => {
  it.each([
    ['ID', { kind: 'scalar', name: 'ID' }],
    ['string', { kind: 'scalar', name: 'string' }],
    ['boolean', { kind: 'scalar', name: 'boolean' }],
    ['readonly number[]', { kind: 'array', item: { kind: 'scalar', name: 'number' } }],
    ['string | null', { kind: 'nullable', inner: { kind: 'scalar', name: 'string' } }],
    ["'a' | 'b'", { kind: 'opaque' }],
    ['Date', { kind: 'opaque' }],
  ])('%s → %o', (form, value) => {
    const { type, reader } = read(form);
    expect(readModelValue(type, reader)).toEqual(value);
  });
});

describe('model declaration', () => {
  it.each([
    ['Thing', 'ok'],
    ['{ id: string }', 'rejected: model must be a named object type; got { id: string; }'],
    ['Identity<Thing>', 'ok'],
    ['string', 'rejected: model must be a named object type; got string'],
  ])('%s → %s', (form, expected) => {
    const { type, reader } = read(form);
    expect(outcome(readModelDeclaration(type, reader))).toBe(expected);
  });
});
