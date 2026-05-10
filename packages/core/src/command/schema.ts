// Arg: positional引数
export type ArgDef = {
  readonly name: string;
  readonly type: 'string' | 'number';
  readonly description?: string;
  optional?: true;
};

// Option: --flag 形式 (discriminated union で type と default の整合性を保証)
type StringOptionDef = {
  readonly name: string;
  type: 'string';
  readonly description?: string;
  readonly alias?: string;
  readonly default?: string;
};

type NumberOptionDef = {
  readonly name: string;
  type: 'number';
  readonly description?: string;
  readonly alias?: string;
  readonly default?: number;
};

type BooleanOptionDef = {
  readonly name: string;
  type: 'boolean';
  readonly description?: string;
  readonly alias?: string;
  readonly default?: boolean;
};

export type OptionDef = StringOptionDef | NumberOptionDef | BooleanOptionDef;

export type SchemaDefinition = {
  readonly args?: readonly ArgDef[];
  readonly options?: readonly OptionDef[];
};

// Arg の型推論
type InferArgType<T extends ArgDef> = T extends { optional: true }
  ? T['type'] extends 'string'
    ? string | undefined
    : number | undefined
  : T['type'] extends 'string'
    ? string
    : number;

// Option の型推論 (boolean は常に boolean、CLIパーサーでは false がデフォルト)
type InferOptionType<T extends OptionDef> = T extends { default: infer D }
  ? D extends string
    ? string
    : D extends number
      ? number
      : boolean
  : T['type'] extends 'boolean'
    ? boolean
    : T['type'] extends 'string'
      ? string | undefined
      : number | undefined;

// 配列から名前をキーとしたオブジェクト型を生成
type InferArgs<T extends readonly ArgDef[]> = {
  [K in T[number] as K['name']]: InferArgType<K>;
};

type InferOptions<T extends readonly OptionDef[]> = {
  [K in T[number] as K['name']]: InferOptionType<K>;
};

// biome-ignore lint/complexity/noBannedTypes: empty object intersection does not affect result type
type Empty = {};

// Schema全体の推論
export type InferSchema<T extends SchemaDefinition> = (T['args'] extends readonly ArgDef[]
  ? InferArgs<T['args']>
  : Empty) &
  (T['options'] extends readonly OptionDef[] ? InferOptions<T['options']> : Empty);

// cliSchema()は型を狭めるためのidentity関数
// const type parameter (TS 5.x) で as const 不要にする
export const cliSchema = <const T extends SchemaDefinition>(schema: T): T => schema;
