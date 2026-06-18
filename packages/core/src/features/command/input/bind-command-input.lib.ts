import type { ArgDef, OptionDef, SchemaDefinition } from './command-schema.types';

export type BoundCommandArgs = Record<string, unknown>;

export type BindCommandInputResult =
  | { ok: true; parsed: BoundCommandArgs }
  | { ok: false; error: string };

type ParsedTokens = {
  readonly values: Record<string, unknown>;
  readonly positionals: string[];
};

type MutableParsedTokens = {
  readonly values: Record<string, unknown>;
  readonly positionals: string[];
};

type TokenParseStep = {
  readonly nextIndex: number;
  readonly done: boolean;
};

const applyDefaults = (
  values: Record<string, unknown>,
  options: readonly OptionDef[],
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...values };
  for (const opt of options) {
    if (result[opt.name] === undefined) {
      if (opt.type === 'boolean') {
        result[opt.name] = opt.default ?? false;
      } else if (opt.default !== undefined) {
        result[opt.name] = opt.default;
      }
    }
  }
  return result;
};

const convertNumberOptions = (
  values: Record<string, unknown>,
  options: readonly OptionDef[],
): { ok: true; result: Record<string, unknown> } | { ok: false; error: string } => {
  const result: Record<string, unknown> = { ...values };
  for (const opt of options) {
    if (opt.type === 'number' && typeof result[opt.name] === 'string') {
      const num = Number(result[opt.name]);
      if (!Number.isFinite(num)) {
        return { ok: false, error: `Invalid number for option --${opt.name}: ${result[opt.name]}` };
      }
      result[opt.name] = num;
    }
  }
  return { ok: true, result };
};

const findOptionByAlias = (options: readonly OptionDef[], alias: string): OptionDef | undefined =>
  options.find((opt) => opt.alias === alias);

const findOptionByName = (options: readonly OptionDef[], name: string): OptionDef | undefined =>
  options.find((opt) => opt.name === name);

const parseBooleanOptionValue = (optionName: string, inlineValue: string | undefined): boolean => {
  if (inlineValue === undefined || inlineValue === 'true') return true;
  if (inlineValue === 'false') return false;
  throw new Error(`Invalid boolean value for option --${optionName}: ${inlineValue}`);
};

const readOptionValue = (
  argv: readonly string[],
  index: number,
  option: OptionDef | undefined,
  inlineValue: string | undefined,
): { value: unknown; nextIndex: number } => {
  if (!option) {
    return { value: inlineValue ?? true, nextIndex: index };
  }
  if (option.type === 'boolean') {
    return { value: parseBooleanOptionValue(option.name, inlineValue), nextIndex: index };
  }
  if (inlineValue !== undefined) {
    return { value: inlineValue, nextIndex: index };
  }
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for option --${option.name}`);
  }
  return { value, nextIndex: index + 1 };
};

const readLongOption = (
  token: string,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: MutableParsedTokens,
): number => {
  const optionToken = token.slice(2);
  const eqIndex = optionToken.indexOf('=');
  const name = eqIndex >= 0 ? optionToken.slice(0, eqIndex) : optionToken;
  const inlineValue = eqIndex >= 0 ? optionToken.slice(eqIndex + 1) : undefined;
  const option = findOptionByName(options, name);
  const { value, nextIndex } = readOptionValue(argv, index, option, inlineValue);
  result.values[option?.name ?? name] = value;
  return nextIndex;
};

const readShortOption = (
  token: string,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: MutableParsedTokens,
): number => {
  const alias = token.slice(1);
  const option = findOptionByAlias(options, alias);
  const { value, nextIndex } = readOptionValue(argv, index, option, undefined);
  result.values[option?.name ?? alias] = value;
  return nextIndex;
};

const parseCommandToken = (
  token: string | undefined,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: MutableParsedTokens,
): TokenParseStep => {
  if (token === undefined) return { nextIndex: index, done: false };
  if (token === '--') {
    result.positionals.push(...argv.slice(index + 1));
    return { nextIndex: index, done: true };
  }
  if (token.startsWith('--') && token.length > 2) {
    return { nextIndex: readLongOption(token, argv, index, options, result), done: false };
  }
  if (token.startsWith('-') && token.length === 2) {
    return { nextIndex: readShortOption(token, argv, index, options, result), done: false };
  }
  result.positionals.push(token);
  return { nextIndex: index, done: false };
};

const parseCommandTokens = (
  argv: readonly string[],
  options: readonly OptionDef[],
): ParsedTokens => {
  const result: MutableParsedTokens = { values: {}, positionals: [] };

  for (let i = 0; i < argv.length; i++) {
    const step = parseCommandToken(argv[i], argv, i, options, result);
    i = step.nextIndex;
    if (step.done) break;
  }

  return result;
};

const parsePositionalArgs = (
  positionals: string[],
  argDefs: readonly ArgDef[],
): { ok: true; result: Record<string, unknown> } | { ok: false; error: string } => {
  const result: Record<string, unknown> = {};
  for (const [i, def] of argDefs.entries()) {
    const value = positionals[i];

    if (value === undefined) {
      if (!def.optional) {
        return { ok: false, error: `Missing required argument: ${def.name} (position ${i + 1})` };
      }
      result[def.name] = undefined;
      continue;
    }

    if (def.type === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        return { ok: false, error: `Invalid number for argument ${def.name}: ${value}` };
      }
      result[def.name] = num;
    } else {
      result[def.name] = value;
    }
  }
  return { ok: true, result };
};

export const bindCommandInput = (
  tokens: readonly string[],
  schema: SchemaDefinition,
): BindCommandInputResult => {
  try {
    const optionsDef = schema.options ?? [];
    const argsDef = schema.args ?? [];

    const { values, positionals } = parseCommandTokens(tokens, optionsDef);

    const valuesWithDefaults = applyDefaults(values, optionsDef);

    const numberConversion = convertNumberOptions(valuesWithDefaults, optionsDef);
    if (!numberConversion.ok) {
      return { ok: false, error: numberConversion.error };
    }

    const positionalResult = parsePositionalArgs(positionals, argsDef);
    if (!positionalResult.ok) {
      return { ok: false, error: positionalResult.error };
    }

    return {
      ok: true,
      parsed: { ...positionalResult.result, ...numberConversion.result },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};
