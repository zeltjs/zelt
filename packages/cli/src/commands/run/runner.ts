import type { CommandClass, CommandContext } from '@zeltjs/command';
import { Container } from '@needle-di/core';
import type { ArgsDef, BooleanArgDef, StringArgDef } from 'citty';
import { parseArgs } from 'citty';
import { fromPromise, fromThrowable, ok, type Result, type ResultAsync } from 'neverthrow';

export type RunCommandError = { type: 'COMMAND_EXECUTION_FAILED'; cause: unknown };

type InstanceShape = {
  args?: Record<string, { type: string; default?: string }>;
  options?: Record<string, { type: string; alias?: string; default?: boolean | string }>;
  run: (ctx: CommandContext) => Promise<void> | void;
};

type ParsedArgs = {
  _: string[];
  [key: string]: unknown;
};

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

const buildCittyArgs = (commandClass: CommandClass): ArgsDef => {
  const instance = Object.create(commandClass.prototype) as InstanceShape;
  const cittyArgs: ArgsDef = {};

  for (const [key, def] of Object.entries(instance.args ?? {})) {
    cittyArgs[key] = toPositionalArg(def);
  }

  for (const [key, def] of Object.entries(instance.options ?? {})) {
    cittyArgs[key] = def.type === 'boolean' ? toBooleanArg(def) : toStringArg(def);
  }

  return cittyArgs;
};

const buildArgs = (
  instance: InstanceShape,
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

const buildOptions = (instance: InstanceShape, parsed: ParsedArgs): Record<string, unknown> => {
  const options: Record<string, unknown> = {};
  for (const key of Object.keys(instance.options ?? {})) {
    options[key] = parsed[key] ?? instance.options?.[key]?.default;
  }
  return options;
};

const parseAndResolve = (
  commandClass: CommandClass,
  argv: string[],
): Result<{ instance: InstanceShape; ctx: CommandContext }, never> => {
  const cittyArgs = buildCittyArgs(commandClass);
  const parsed = parseArgs(argv, cittyArgs) as ParsedArgs;

  const container = new Container();
  const instance = container.get(commandClass) as InstanceShape;

  const ctx: CommandContext = {
    args: buildArgs(instance, parsed),
    options: buildOptions(instance, parsed),
  } as CommandContext;

  return ok({ instance, ctx });
};

const executeRun = (
  instance: InstanceShape,
  ctx: CommandContext,
): ResultAsync<void, RunCommandError> => {
  const safeRun = fromThrowable(
    () => instance.run(ctx),
    (cause) => ({ type: 'COMMAND_EXECUTION_FAILED' as const, cause }),
  );

  return safeRun().asyncAndThen((maybePromise) =>
    fromPromise(Promise.resolve(maybePromise), (cause) => ({
      type: 'COMMAND_EXECUTION_FAILED' as const,
      cause,
    })),
  );
};

export const runCommand = (
  commandClass: CommandClass,
  argv: string[],
): ResultAsync<void, RunCommandError> =>
  parseAndResolve(commandClass, argv).asyncAndThen(({ instance, ctx }) =>
    executeRun(instance, ctx),
  );
