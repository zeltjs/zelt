export type VariadicDef = {
  readonly min?: number;
  readonly max?: number;
};

export type ArgDef = {
  readonly name: string;
  type: 'string' | 'number';
  readonly description?: string;
} & (
  | { optional?: true; readonly variadic?: never }
  | { readonly variadic: VariadicDef; readonly optional?: never }
);

type OptionPresence<T> =
  | { required: true; readonly default?: never }
  | { readonly required?: never; readonly default?: T };

type OptionMetadata = {
  readonly name: string;
  readonly description?: string;
  readonly alias?: string;
};

export type OptionDef = OptionMetadata &
  (
    | ({ type: 'string' } & OptionPresence<string>)
    | ({ type: 'number' } & OptionPresence<number>)
    | ({ type: 'boolean' } & OptionPresence<boolean>)
  );

export type SchemaDefinition = {
  readonly args?: readonly ArgDef[];
  readonly options?: readonly OptionDef[];
  readonly kind?: never;
};

export type SchemaUnion<S extends readonly SchemaDefinition[] = readonly SchemaDefinition[]> = {
  kind: 'union';
  readonly schemas: S;
};

export type CommandInputSchema = SchemaDefinition | SchemaUnion;

type ValueType<T extends { readonly type: string }> = T['type'] extends 'string'
  ? string
  : T['type'] extends 'number'
    ? number
    : boolean;

type InferArgType<T extends ArgDef> = T extends { readonly variadic: VariadicDef }
  ? ValueType<T>[]
  : T extends { optional: true }
    ? ValueType<T> | undefined
    : ValueType<T>;

type InferOptionType<T extends OptionDef> = T extends
  | { required: true }
  | { readonly default: unknown }
  | { type: 'boolean' }
  ? ValueType<T>
  : ValueType<T> | undefined;

type InferArgs<T extends readonly ArgDef[]> = {
  [K in T[number] as K['name']]: InferArgType<K>;
};

type InferOptions<T extends readonly OptionDef[]> = {
  [K in T[number] as K['name']]: InferOptionType<K>;
};

// biome-ignore lint/complexity/noBannedTypes: empty object intersection does not affect result type
type Empty = {};

type InferDefinition<T extends SchemaDefinition> = (T['args'] extends readonly ArgDef[]
  ? InferArgs<T['args']>
  : Empty) &
  (T['options'] extends readonly OptionDef[] ? InferOptions<T['options']> : Empty);

type UnionKeys<T> = T extends unknown ? keyof T : never;
type ExclusiveUnion<T, All = T> = T extends unknown
  ? T & { [K in Exclude<UnionKeys<All>, keyof T>]?: never }
  : never;

type InferDefinitions<T extends SchemaDefinition> = T extends unknown ? InferDefinition<T> : never;

export type InferSchema<T extends CommandInputSchema> =
  T extends SchemaUnion<infer S>
    ? ExclusiveUnion<InferDefinitions<S[number]>>
    : T extends SchemaDefinition
      ? InferDefinition<T>
      : never;

type ArgsOf<T extends SchemaDefinition> = T extends {
  readonly args: infer A extends readonly ArgDef[];
}
  ? A
  : readonly [];
type OptionsOf<T extends SchemaDefinition> = T extends {
  readonly options: infer O extends readonly OptionDef[];
}
  ? O
  : readonly [];

type DuplicateNames<
  T extends readonly { readonly name: string }[],
  Seen extends string = never,
> = T extends readonly [
  infer H extends { readonly name: string },
  ...infer R extends readonly { readonly name: string }[],
]
  ? string extends H['name']
    ? DuplicateNames<R, Seen>
    : H['name'] extends Seen
      ? `Duplicate input name: ${H['name']}`
      : DuplicateNames<R, Seen | H['name']>
  : never;

type OptionNames<T extends OptionDef> =
  | T['name']
  | (T extends { readonly alias: infer A extends string } ? A : never);
type DuplicateOptionNames<
  T extends readonly OptionDef[],
  Seen extends string = never,
> = T extends readonly [infer H extends OptionDef, ...infer R extends readonly OptionDef[]]
  ? string extends OptionNames<H>
    ? DuplicateOptionNames<R, Seen>
    : Extract<OptionNames<H>, Seen> extends never
      ? DuplicateOptionNames<R, Seen | OptionNames<H>>
      : `Duplicate option name or alias: ${Extract<OptionNames<H>, Seen>}`
  : never;

type InvalidVariadicPlacement<T extends readonly ArgDef[]> = T extends readonly [
  infer H extends ArgDef,
  ...infer R extends readonly ArgDef[],
]
  ? H extends { readonly variadic: VariadicDef }
    ? R extends readonly []
      ? never
      : 'Variadic argument must be last'
    : InvalidVariadicPlacement<R>
  : never;

type SchemaErrors<T extends SchemaDefinition> =
  | DuplicateNames<readonly [...ArgsOf<T>, ...OptionsOf<T>]>
  | DuplicateOptionNames<OptionsOf<T>>
  | InvalidVariadicPlacement<ArgsOf<T>>;

export type SchemaConstraint<T extends SchemaDefinition> = [SchemaErrors<T>] extends [never]
  ? unknown
  : { readonly __commandSchemaError: SchemaErrors<T> };
