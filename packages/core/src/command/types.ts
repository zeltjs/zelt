export type ArgDefinition = {
  type: 'positional';
  readonly default?: string;
  readonly description?: string;
  readonly required?: boolean;
};

export type OptionDefinition = {
  readonly type: 'boolean' | 'string';
  readonly alias?: string;
  readonly default?: boolean | string;
  readonly description?: string;
};

export type ArgsDefinition = Record<string, ArgDefinition>;
export type OptionsDefinition = Record<string, OptionDefinition>;

type InferArgType<T extends ArgDefinition> = T['default'] extends string
  ? string
  : T['required'] extends true
    ? string
    : string | undefined;

type InferOptionType<T extends OptionDefinition> = T['type'] extends 'boolean'
  ? T['default'] extends boolean
    ? boolean
    : boolean | undefined
  : T['default'] extends string
    ? string
    : string | undefined;

export type InferArgs<T extends ArgsDefinition> = {
  [K in keyof T]: InferArgType<T[K]>;
};

export type InferOptions<T extends OptionsDefinition> = {
  [K in keyof T]: InferOptionType<T[K]>;
};

export type CommandContext<
  TArgs extends ArgsDefinition = ArgsDefinition,
  TOptions extends OptionsDefinition = OptionsDefinition,
> = {
  readonly args: InferArgs<TArgs>;
  readonly options: InferOptions<TOptions>;
};

// Legacy command class (args/options properties)
export type LegacyCommandClass = new (
  ...args: never[]
) => {
  args?: ArgsDefinition;
  options?: OptionsDefinition;
  run(ctx: CommandContext): Promise<void> | void;
};

// New command class (static schema)
export type NewCommandClass = (new (
  ...args: never[]
) => {
  run(ctx?: unknown): Promise<void> | void;
}) & {
  schema: import('./schema').SchemaDefinition;
};

// Union of both for backward compatibility
export type CommandClass = LegacyCommandClass | NewCommandClass;
