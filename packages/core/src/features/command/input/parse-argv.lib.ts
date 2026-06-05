import type { ParseArgsConfig } from 'node:util';
import { parseArgs } from 'node:util';

import type { ArgDef, OptionDef, SchemaDefinition } from './command-schema.types';

export type ParsedArgs = Record<string, unknown>;

export type ParseResult = { ok: true; parsed: ParsedArgs } | { ok: false; error: string };

const buildOptionsConfig = (
  options: readonly OptionDef[],
): NonNullable<ParseArgsConfig['options']> => {
  const config: NonNullable<ParseArgsConfig['options']> = {};
  for (const opt of options) {
    const entry: { type: 'boolean' | 'string'; short?: string } = {
      type: opt.type === 'boolean' ? 'boolean' : 'string',
    };
    if (opt.alias) {
      entry.short = opt.alias;
    }
    config[opt.name] = entry;
  }
  return config;
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

export const parseArgv = (argv: readonly string[], schema: SchemaDefinition): ParseResult => {
  try {
    const optionsDef = schema.options ?? [];
    const argsDef = schema.args ?? [];

    const config: ParseArgsConfig = {
      args: [...argv],
      options: buildOptionsConfig(optionsDef),
      allowPositionals: true,
      strict: false,
    };

    const { values, positionals } = parseArgs(config);

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
