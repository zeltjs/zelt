import type {
  ArgDef,
  CommandInputSchema,
  OptionDef,
  SchemaDefinition,
  SchemaUnion,
  VariadicDef,
} from './command-schema.types';
import { validateCommandSchema } from './validate-command-schema.lib';

export type BoundCommandArgs = Record<string, unknown>;
export type BindCommandInputResult =
  | { ok: true; readonly parsed: BoundCommandArgs }
  | { ok: false; readonly error: string; readonly kind: 'input' | 'schema' };

type ParseResult<T> = { ok: true; readonly value: T } | { ok: false; readonly error: string };
type OptionValue = string | number | boolean;
type ParsedTokens = { readonly values: Map<string, OptionValue>; readonly positionals: string[] };
type OptionToken = {
  readonly name: string;
  readonly inlineValue: string | undefined;
  readonly long: boolean;
};
type TokenStep = { readonly nextIndex: number; readonly done: boolean };

const parseNumber = (value: string, label: string): ParseResult<number> => {
  const number = Number(value);
  return Number.isFinite(number)
    ? { ok: true, value: number }
    : { ok: false, error: `Invalid number for ${label}: ${value}` };
};

const isOptionToken = (token: string): boolean =>
  token.startsWith('-') && token.length > 1 && !Number.isFinite(Number(token));

const parseBoolean = (value: string | undefined, name: string): ParseResult<boolean> => {
  if (value === undefined || value === 'true') return { ok: true, value: true };
  if (value === 'false') return { ok: true, value: false };
  return { ok: false, error: `Invalid boolean value for option --${name}: ${value}` };
};

const readScalarOptionValue = (
  argv: readonly string[],
  index: number,
  name: string,
  inlineValue: string | undefined,
): ParseResult<{ readonly text: string; readonly nextIndex: number }> => {
  const text = inlineValue ?? argv[index + 1];
  if (text === undefined || (inlineValue === undefined && isOptionToken(text))) {
    return { ok: false, error: `Missing value for option --${name}` };
  }
  return { ok: true, value: { text, nextIndex: inlineValue === undefined ? index + 1 : index } };
};

const readOptionValue = (
  argv: readonly string[],
  index: number,
  option: OptionDef,
  inlineValue: string | undefined,
): ParseResult<{ readonly value: OptionValue; readonly nextIndex: number }> => {
  if (option.type === 'boolean') {
    const result = parseBoolean(inlineValue, option.name);
    return result.ok ? { ok: true, value: { value: result.value, nextIndex: index } } : result;
  }
  const text = readScalarOptionValue(argv, index, option.name, inlineValue);
  if (!text.ok) return text;
  const parsed =
    option.type === 'number'
      ? parseNumber(text.value.text, `option --${option.name}`)
      : { ok: true as const, value: text.value.text };
  return parsed.ok
    ? { ok: true, value: { value: parsed.value, nextIndex: text.value.nextIndex } }
    : parsed;
};

const optionToken = (token: string): OptionToken => {
  const long = token.startsWith('--');
  const text = token.slice(long ? 2 : 1);
  const equals = long ? text.indexOf('=') : -1;
  return {
    long,
    name: equals < 0 ? text : text.slice(0, equals),
    inlineValue: equals < 0 ? undefined : text.slice(equals + 1),
  };
};

const readOption = (
  token: string,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: ParsedTokens,
): ParseResult<TokenStep> => {
  const { long, name, inlineValue } = optionToken(token);
  const option = options.find((candidate) =>
    long ? candidate.name === name : candidate.alias === name,
  );
  if (!option) return { ok: false, error: `Unknown option: ${long ? '--' : '-'}${name}` };
  const parsed = readOptionValue(argv, index, option, inlineValue);
  if (!parsed.ok) return parsed;
  result.values.set(option.name, parsed.value.value);
  return { ok: true, value: { nextIndex: parsed.value.nextIndex, done: false } };
};

const parseToken = (
  token: string,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: ParsedTokens,
): ParseResult<TokenStep> => {
  if (token === '--') {
    result.positionals.push(...argv.slice(index + 1));
    return { ok: true, value: { nextIndex: index, done: true } };
  }
  if (isOptionToken(token)) return readOption(token, argv, index, options, result);
  result.positionals.push(token);
  return { ok: true, value: { nextIndex: index, done: false } };
};

const parseCommandTokens = (
  argv: readonly string[],
  options: readonly OptionDef[],
): ParseResult<ParsedTokens> => {
  const result: ParsedTokens = { values: new Map(), positionals: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === undefined) continue;
    const step = parseToken(token, argv, index, options, result);
    if (!step.ok) return step;
    index = step.value.nextIndex;
    if (step.value.done) break;
  }
  return { ok: true, value: result };
};

const parseArgumentValue = (value: string, def: ArgDef): ParseResult<string | number> =>
  def.type === 'number' ? parseNumber(value, `argument ${def.name}`) : { ok: true, value };

const validateArgumentCount = (
  name: string,
  count: number,
  bounds: VariadicDef,
): ParseResult<undefined> => {
  const min = bounds.min ?? 0;
  const max = bounds.max;
  if (count < min || (max !== undefined && count > max)) {
    return {
      ok: false,
      error: `Argument ${name} requires ${min} to ${max ?? 'unlimited'} values; received ${count}`,
    };
  }
  return { ok: true, value: undefined };
};

const parseVariadic = (
  values: readonly string[],
  def: ArgDef,
  bounds: VariadicDef,
): ParseResult<(string | number)[]> => {
  const count = validateArgumentCount(def.name, values.length, bounds);
  if (!count.ok) return count;
  const array: (string | number)[] = [];
  for (const text of values) {
    const value = parseArgumentValue(text, def);
    if (!value.ok) return value;
    array.push(value.value);
  }
  return { ok: true, value: array };
};

const parseFixedArgument = (
  value: string | undefined,
  def: ArgDef,
  index: number,
): ParseResult<unknown> => {
  if (value !== undefined) return parseArgumentValue(value, def);
  if (def.optional) return { ok: true, value: undefined };
  return { ok: false, error: `Missing required argument: ${def.name} (position ${index + 1})` };
};

const parsePositionalArgs = (
  positionals: readonly string[],
  args: readonly ArgDef[],
): ParseResult<BoundCommandArgs> => {
  const values = new Map<string, unknown>();
  let index = 0;
  for (const def of args) {
    const parsed = def.variadic
      ? parseVariadic(positionals.slice(index), def, def.variadic)
      : parseFixedArgument(positionals[index], def, index);
    if (!parsed.ok) return parsed;
    values.set(def.name, parsed.value);
    index = def.variadic ? positionals.length : index + 1;
  }
  if (positionals.length > index)
    return {
      ok: false,
      error: `Too many positional arguments: allowed ${args.length}; received ${positionals.length}`,
    };
  return { ok: true, value: Object.fromEntries(values) };
};

const optionDefault = (option: OptionDef): OptionValue | undefined =>
  option.default ?? (option.type === 'boolean' ? false : undefined);

const completeOptions = (
  values: ReadonlyMap<string, OptionValue>,
  options: readonly OptionDef[],
): ParseResult<BoundCommandArgs> => {
  const completed = new Map(values);
  for (const option of options) {
    if (completed.has(option.name)) continue;
    if (option.required) return { ok: false, error: `Missing required option: --${option.name}` };
    const value = optionDefault(option);
    if (value !== undefined) completed.set(option.name, value);
  }
  return { ok: true, value: Object.fromEntries(completed) };
};

const bindDefinition = (
  tokens: readonly string[],
  schema: SchemaDefinition,
): BindCommandInputResult => {
  const options = schema.options ?? [];
  const parsed = parseCommandTokens(tokens, options);
  if (!parsed.ok) return { ...parsed, kind: 'input' };
  const values = completeOptions(parsed.value.values, options);
  if (!values.ok) return { ...values, kind: 'input' };
  const args = parsePositionalArgs(parsed.value.positionals, schema.args ?? []);
  if (!args.ok) return { ...args, kind: 'input' };
  return { ok: true, parsed: { ...args.value, ...values.value } };
};

const selectUnionResult = (
  tokens: readonly string[],
  successes: readonly BoundCommandArgs[],
  errors: readonly string[],
): BindCommandInputResult => {
  const only = successes[0];
  if (successes.length === 1 && only !== undefined) return { ok: true, parsed: only };
  if (successes.length > 1)
    return {
      ok: false,
      kind: 'input',
      error: `Ambiguous command input: ${successes.length} alternatives accept the supplied input (${tokens.join(' ')})`,
    };
  return {
    ok: false,
    kind: 'input',
    error: `No alternative accepts the entire input (${tokens.join(' ')}):\n${errors.join('\n')}`,
  };
};

const bindUnion = (tokens: readonly string[], schema: SchemaUnion): BindCommandInputResult => {
  const successes: BoundCommandArgs[] = [];
  const errors: string[] = [];
  for (const [index, branch] of schema.schemas.entries()) {
    const result = bindDefinition(tokens, branch);
    if (result.ok) successes.push(result.parsed);
    else errors.push(`Alternative ${index + 1}: ${result.error}`);
  }
  return selectUnionResult(tokens, successes, errors);
};

export const bindCommandInput = (
  tokens: readonly string[],
  schema: CommandInputSchema,
): BindCommandInputResult => {
  const validation = validateCommandSchema(schema);
  if (!validation.ok) return { ...validation, kind: 'schema' };
  return schema.kind === 'union' ? bindUnion(tokens, schema) : bindDefinition(tokens, schema);
};
