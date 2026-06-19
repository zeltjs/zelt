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

type ParseErrorResult = { ok: false; readonly error: string };

type OptionValueReadResult =
  | { ok: true; readonly value: unknown; readonly nextIndex: number }
  | ParseErrorResult;

type TokenParseStep =
  | { ok: true; readonly nextIndex: number; readonly done: boolean }
  | ParseErrorResult;

type ParseCommandTokensResult = { ok: true; readonly result: ParsedTokens } | ParseErrorResult;

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

const parseBooleanOptionValue = (
  optionName: string,
  inlineValue: string | undefined,
): { ok: true; value: boolean } | ParseErrorResult => {
  if (inlineValue === undefined || inlineValue === 'true') return { ok: true, value: true };
  if (inlineValue === 'false') return { ok: true, value: false };
  return { ok: false, error: `Invalid boolean value for option --${optionName}: ${inlineValue}` };
};

const readOptionValue = (
  argv: readonly string[],
  index: number,
  option: OptionDef | undefined,
  inlineValue: string | undefined,
): OptionValueReadResult => {
  if (!option) {
    return { ok: true, value: inlineValue ?? true, nextIndex: index };
  }
  if (option.type === 'boolean') {
    const parsed = parseBooleanOptionValue(option.name, inlineValue);
    if (!parsed.ok) return parsed;
    return { ok: true, value: parsed.value, nextIndex: index };
  }
  if (inlineValue !== undefined) {
    return { ok: true, value: inlineValue, nextIndex: index };
  }
  const value = argv[index + 1];
  if (value === undefined) {
    return { ok: false, error: `Missing value for option --${option.name}` };
  }
  return { ok: true, value, nextIndex: index + 1 };
};

const readLongOption = (
  token: string,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: MutableParsedTokens,
): { ok: true; nextIndex: number } | ParseErrorResult => {
  const optionToken = token.slice(2);
  const eqIndex = optionToken.indexOf('=');
  const name = eqIndex >= 0 ? optionToken.slice(0, eqIndex) : optionToken;
  const inlineValue = eqIndex >= 0 ? optionToken.slice(eqIndex + 1) : undefined;
  const option = findOptionByName(options, name);
  const readResult = readOptionValue(argv, index, option, inlineValue);
  if (!readResult.ok) return readResult;
  result.values[option?.name ?? name] = readResult.value;
  return { ok: true, nextIndex: readResult.nextIndex };
};

const readShortOption = (
  token: string,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: MutableParsedTokens,
): { ok: true; nextIndex: number } | ParseErrorResult => {
  const alias = token.slice(1);
  const option = findOptionByAlias(options, alias);
  const readResult = readOptionValue(argv, index, option, undefined);
  if (!readResult.ok) return readResult;
  result.values[option?.name ?? alias] = readResult.value;
  return { ok: true, nextIndex: readResult.nextIndex };
};

const isLongOptionToken = (token: string): boolean => token.startsWith('--') && token.length > 2;

const isShortOptionToken = (token: string): boolean => token.startsWith('-') && token.length === 2;

const optionParseStep = (
  optionResult: { ok: true; nextIndex: number } | ParseErrorResult,
): TokenParseStep => {
  if (!optionResult.ok) return optionResult;
  return { ok: true, nextIndex: optionResult.nextIndex, done: false };
};

const parseCommandToken = (
  token: string | undefined,
  argv: readonly string[],
  index: number,
  options: readonly OptionDef[],
  result: MutableParsedTokens,
): TokenParseStep => {
  if (token === undefined) return { ok: true, nextIndex: index, done: false };
  if (token === '--') {
    result.positionals.push(...argv.slice(index + 1));
    return { ok: true, nextIndex: index, done: true };
  }
  if (isLongOptionToken(token)) {
    return optionParseStep(readLongOption(token, argv, index, options, result));
  }
  if (isShortOptionToken(token)) {
    return optionParseStep(readShortOption(token, argv, index, options, result));
  }
  result.positionals.push(token);
  return { ok: true, nextIndex: index, done: false };
};

const parseCommandTokens = (
  argv: readonly string[],
  options: readonly OptionDef[],
): ParseCommandTokensResult => {
  const result: MutableParsedTokens = { values: {}, positionals: [] };

  for (let i = 0; i < argv.length; i++) {
    const step = parseCommandToken(argv[i], argv, i, options, result);
    if (!step.ok) return step;
    i = step.nextIndex;
    if (step.done) break;
  }

  return { ok: true, result };
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
  const optionsDef = schema.options ?? [];
  const argsDef = schema.args ?? [];

  const parsedTokens = parseCommandTokens(tokens, optionsDef);
  if (!parsedTokens.ok) {
    return { ok: false, error: parsedTokens.error };
  }
  const { values, positionals } = parsedTokens.result;

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
};
