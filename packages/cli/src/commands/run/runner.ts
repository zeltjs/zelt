import type {
  ArgDef,
  CommandClass,
  CommandContext,
  LegacyCommandClass,
  NewCommandClass,
  SchemaDefinition,
} from '@zeltjs/core';
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

type LegacyInstanceShape = {
  args?: Record<string, { type: string; default?: string }>;
  options?: Record<string, { type: string; alias?: string; default?: boolean | string }>;
  run: (ctx: CommandContext) => Promise<void> | void;
};

type NewInstanceShape = {
  run: (ctx?: unknown) => Promise<void> | void;
};

type ParsedArgs = {
  _: string[];
  [key: string]: unknown;
};

// --- Legacy API helpers ---

const toPositionalArg = (def: { default?: string }): ArgsDef[string] =>
  def.default !== undefined ? { type: 'positional', default: def.default } : { type: 'positional' };

const toBooleanArg = (def: { alias?: string; default?: boolean | string }): BooleanArgDef => {
  const base: BooleanArgDef = { type: 'boolean' };
  if (def.alias !== undefined) base.alias = def.alias;
  if (def.default !== undefined) base.default = def.default as boolean;
  return base;
};

const toStringArg = (def: { alias?: string; default?: boolean | string }): StringArgDef => {
  const base: StringArgDef = { type: 'string' };
  if (def.alias !== undefined) base.alias = def.alias;
  if (def.default !== undefined) base.default = def.default as string;
  return base;
};

const buildLegacyCittyArgs = (commandClass: LegacyCommandClass): ArgsDef => {
  const instance = Object.create(commandClass.prototype) as LegacyInstanceShape;
  const cittyArgs: ArgsDef = {};

  for (const [key, def] of Object.entries(instance.args ?? {})) {
    cittyArgs[key] = toPositionalArg(def);
  }

  for (const [key, def] of Object.entries(instance.options ?? {})) {
    cittyArgs[key] = def.type === 'boolean' ? toBooleanArg(def) : toStringArg(def);
  }

  return cittyArgs;
};

const buildLegacyArgs = (
  instance: LegacyInstanceShape,
  parsed: ParsedArgs,
): Record<string, string | undefined> => {
  const positionalKeys = Object.keys(instance.args ?? {});
  const args: Record<string, string | undefined> = {};
  for (let i = 0; i < positionalKeys.length; i++) {
    const key = positionalKeys[i];
    if (key) {
      args[key] = (parsed._[i] as string | undefined) ?? (instance.args?.[key]?.default as string);
    }
  }
  return args;
};

const buildLegacyOptions = (
  instance: LegacyInstanceShape,
  parsed: ParsedArgs,
): Record<string, unknown> => {
  const options: Record<string, unknown> = {};
  for (const key of Object.keys(instance.options ?? {})) {
    options[key] = parsed[key] ?? instance.options?.[key]?.default;
  }
  return options;
};

// --- New API helpers ---

const getStaticSchema = (commandClass: CommandClass): SchemaDefinition | undefined => {
  const maybeSchema = (commandClass as { schema?: SchemaDefinition }).schema;
  return maybeSchema;
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

// --- Legacy execution ---

const parseAndResolveLegacy = (
  commandClass: LegacyCommandClass,
  argv: string[],
): { instance: LegacyInstanceShape; ctx: CommandContext } => {
  const cittyArgs = buildLegacyCittyArgs(commandClass);
  const parsed = parseArgs(argv, cittyArgs) as ParsedArgs;

  const container = new Container();
  const instance = container.get(commandClass) as LegacyInstanceShape;

  const ctx: CommandContext = {
    args: buildLegacyArgs(instance, parsed),
    options: buildLegacyOptions(instance, parsed),
  } as CommandContext;

  return { instance, ctx };
};

// --- New execution ---

const parseAndResolveNew = (
  commandClass: NewCommandClass,
  argv: string[],
): { instance: NewInstanceShape; parsedArgs: Record<string, unknown> } => {
  const schema = commandClass.schema;

  validateSchema(schema);

  const cittyArgs = buildNewCittyArgs(schema);
  const parsed = parseArgs(argv, cittyArgs) as ParsedArgs;

  const parsedArgs = buildNewArgs(schema, parsed);

  const container = new Container();
  const instance = container.get(commandClass) as NewInstanceShape;

  return { instance, parsedArgs };
};

// --- Main entry point ---

export const runCommand = async (commandClass: CommandClass, argv: string[]): Promise<void> => {
  const staticSchema = getStaticSchema(commandClass);

  if (staticSchema !== undefined) {
    const { instance, parsedArgs } = parseAndResolveNew(commandClass as NewCommandClass, argv);
    try {
      await Promise.resolve(runInCommandContext({ parsedArgs }, () => instance.run()));
    } catch (cause) {
      throw new CommandExecutionError(cause);
    }
    return;
  }

  const { instance, ctx } = parseAndResolveLegacy(commandClass as LegacyCommandClass, argv);
  try {
    await Promise.resolve(instance.run(ctx));
  } catch (cause) {
    throw new CommandExecutionError(cause);
  }
};
