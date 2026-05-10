import type { ArgDef, CommandClass, CommandRunner, SchemaDefinition } from '@zeltjs/core';
import { runInCommandContext } from '@zeltjs/core';
import { Container } from '@needle-di/core';
import type { ArgsDef, BooleanArgDef, StringArgDef } from 'citty';
import { parseArgs } from 'citty';

export class CommandExecutionError extends Error {
  readonly type = 'COMMAND_EXECUTION_FAILED' as const;
  constructor(cause: unknown) {
    super('Command execution failed');
    this.name = 'CommandExecutionError';
    this.cause = cause;
  }
}

export class InvalidNumberError extends Error {
  readonly type = 'INVALID_NUMBER' as const;
  constructor(
    readonly argName: string,
    readonly value: unknown,
  ) {
    super(`Invalid number for '${argName}': ${String(value)}`);
    this.name = 'InvalidNumberError';
  }
}

export class SchemaValidationError extends Error {
  readonly type = 'SCHEMA_VALIDATION_FAILED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

type ParsedArgs = {
  _: string[];
  [key: string]: unknown;
};

const validateSchema = (schema: SchemaDefinition): void => {
  const argNames = new Set((schema.args ?? []).map((a) => a.name));
  const optionNames = new Set((schema.options ?? []).map((o) => o.name));

  for (const name of argNames) {
    if (optionNames.has(name)) {
      throw new SchemaValidationError(`Duplicate name '${name}' in args and options`);
    }
  }
};

const optionToCittyArg = (opt: {
  type: string;
  alias?: string;
  default?: unknown;
}): BooleanArgDef | StringArgDef => {
  if (opt.type === 'boolean') {
    const def: BooleanArgDef = { type: 'boolean' };
    if (opt.alias !== undefined) def.alias = opt.alias;
    if (opt.default !== undefined) def.default = opt.default as boolean;
    return def;
  }
  const def: StringArgDef = { type: 'string' };
  if (opt.alias !== undefined) def.alias = opt.alias;
  if (opt.default !== undefined) def.default = String(opt.default);
  return def;
};

const buildNewCittyArgs = (schema: SchemaDefinition): ArgsDef => {
  const cittyArgs: ArgsDef = {};

  for (const arg of schema.args ?? []) {
    cittyArgs[arg.name] =
      arg.optional === true ? { type: 'positional', required: false } : { type: 'positional' };
  }

  for (const opt of schema.options ?? []) {
    cittyArgs[opt.name] = optionToCittyArg(opt);
  }

  return cittyArgs;
};

const convertNumber = (value: unknown, name: string): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new InvalidNumberError(name, value);
  }
  return num;
};

const processPositionalArg = (
  arg: ArgDef,
  value: unknown,
  result: Record<string, unknown>,
): void => {
  if (arg.type === 'number' && value !== undefined) {
    result[arg.name] = convertNumber(value, arg.name);
  } else {
    result[arg.name] = value;
  }
};

const processOption = (
  opt: { name: string; type: string; default?: unknown },
  value: unknown,
  result: Record<string, unknown>,
): void => {
  if (opt.type === 'number' && value !== undefined) {
    result[opt.name] = convertNumber(value, opt.name);
  } else if (opt.type === 'boolean') {
    result[opt.name] = value ?? false;
  } else {
    result[opt.name] = value;
  }
};

const buildNewArgs = (schema: SchemaDefinition, parsed: ParsedArgs): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (let i = 0; i < (schema.args ?? []).length; i++) {
    const arg = (schema.args ?? [])[i] as ArgDef;
    processPositionalArg(arg, parsed._[i], result);
  }

  for (const opt of schema.options ?? []) {
    const value = parsed[opt.name] ?? opt.default;
    processOption(opt, value, result);
  }

  return result;
};

const parseAndResolve = (
  commandClass: CommandClass,
  argv: string[],
): { instance: CommandRunner; parsedArgs: Record<string, unknown> } => {
  const schema = commandClass.schema;

  validateSchema(schema);

  const cittyArgs = buildNewCittyArgs(schema);
  const parsed = parseArgs(argv, cittyArgs) as ParsedArgs;

  const parsedArgs = buildNewArgs(schema, parsed);

  const container = new Container();
  const instance = container.get<CommandRunner>(commandClass);

  return { instance, parsedArgs };
};

export const runCommand = async (commandClass: CommandClass, argv: string[]): Promise<void> => {
  const { instance, parsedArgs } = parseAndResolve(commandClass, argv);
  try {
    await Promise.resolve(runInCommandContext({ parsedArgs }, () => instance.run()));
  } catch (cause) {
    throw new CommandExecutionError(cause);
  }
};
