# Command API Improvement Plan

## Context

現在の `@zeltjs/command` のAPI設計に以下の問題がある：

1. **`as const` の多用**: `type: 'positional' as const`, `required: true as const` など、型推論のために冗長な記述が必要
2. **args/options の分離**: 2つのプロパティに分けて定義する必要がある
3. **ctx経由のアクセス**: `run(ctx)` で `ctx.args.name`, `ctx.options.verbose` のようにアクセスが冗長

### 現状のAPI

```typescript
@Command({ name: 'greet' })
class GreetCommand {
  readonly args = {
    name: { type: 'positional' as const, required: true as const },
  };
  readonly options = {
    verbose: { type: 'boolean' as const, default: false },
  };

  run(ctx: { args: Record<string, string | undefined>; options: Record<string, unknown> }) {
    console.log(`Hello, ${ctx.args.name}!`);
  }
}
```

### 理想のAPI

```typescript
@Command({ name: 'greet', description: 'Greet a user' })
export class GreetCommand {
  static schema = cliSchema({
    // args: 配列で順序を保持、positional引数
    args: [
      { name: 'target', type: 'string' },              // required by default
      { name: 'message', type: 'string', optional: true }, // optional positional
    ],
    // options: --flag 形式
    options: [
      { name: 'port', type: 'number', default: 3000 },
      { name: 'verbose', type: 'boolean', alias: 'v' },
    ],
  });

  run(ctx = args(GreetCommand)) {
    console.log(`Hello, ${ctx.target}!`);  // 型付き、フラットアクセス
    // ctx.port は number, ctx.verbose は boolean
  }
}
```

## Design

### 1. Schema Definition

#### 新しい型定義 (`packages/command/src/schema.ts`)

```typescript
// Arg: positional引数
type ArgDef = {
  readonly name: string;
  readonly type: 'string' | 'number';
  readonly description?: string;
  readonly optional?: true;
};

// Option: --flag 形式 (discriminated union で type と default の整合性を保証)
type StringOptionDef = {
  readonly name: string;
  readonly type: 'string';
  readonly description?: string;
  readonly alias?: string;
  readonly default?: string;
};

type NumberOptionDef = {
  readonly name: string;
  readonly type: 'number';
  readonly description?: string;
  readonly alias?: string;
  readonly default?: number;
};

type BooleanOptionDef = {
  readonly name: string;
  readonly type: 'boolean';
  readonly description?: string;
  readonly alias?: string;
  readonly default?: boolean;
};

type OptionDef = StringOptionDef | NumberOptionDef | BooleanOptionDef;

type SchemaDefinition = {
  readonly args?: readonly ArgDef[];
  readonly options?: readonly OptionDef[];
};

// cliSchema()は型を狭めるためのidentity関数
// const type parameter (TS 5.x) で as const 不要にする
export const cliSchema = <const T extends SchemaDefinition>(schema: T): T => schema;
```

#### 型推論

```typescript
// Arg の型推論
type InferArgType<T extends ArgDef> = 
  T extends { optional: true } 
    ? (T['type'] extends 'string' ? string | undefined : number | undefined)
    : (T['type'] extends 'string' ? string : number);

// Option の型推論 (boolean は常に boolean、CLIパーサーでは false がデフォルト)
type InferOptionType<T extends OptionDef> = 
  T extends { default: infer D } 
    ? (D extends string ? string : D extends number ? number : boolean)
    : T['type'] extends 'boolean' ? boolean  // boolean は undefined にならない
    : T['type'] extends 'string' ? string | undefined 
    : number | undefined;

// 配列から名前をキーとしたオブジェクト型を生成
type InferArgs<T extends readonly ArgDef[]> = {
  [K in T[number] as K['name']]: InferArgType<K>;
};

type InferOptions<T extends readonly OptionDef[]> = {
  [K in T[number] as K['name']]: InferOptionType<K>;
};

// Schema全体の推論
type InferSchema<T extends SchemaDefinition> = 
  (T['args'] extends readonly ArgDef[] ? InferArgs<T['args']> : {}) &
  (T['options'] extends readonly OptionDef[] ? InferOptions<T['options']> : {});
```

### 2. args() 関数

AsyncLocalStorage経由でパースされた引数を取得し、クラスのschemaから型を推論する。

```typescript
// packages/command/src/primitives/args.ts
import { getCommandContext } from '../internal/command-context';

type CommandWithSchema = { schema: SchemaDefinition };

export const args = <T extends CommandWithSchema>(
  _commandClass: T
): InferSchema<T['schema']> => {
  return getCommandContext().parsedArgs as InferSchema<T['schema']>;
};
```

### 3. Command Context (AsyncLocalStorage)

```typescript
// packages/command/src/internal/command-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

type CommandContextStore = {
  readonly parsedArgs: Record<string, unknown>;
};

const storage = new AsyncLocalStorage<CommandContextStore>();

export const runInCommandContext = <T>(ctx: CommandContextStore, fn: () => T): T => 
  storage.run(ctx, fn);

export const getCommandContext = (): CommandContextStore => {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('zelt/command: args() called outside command execution');
  return ctx;
};
```

### 4. Runner の修正

`packages/cli/src/commands/run/runner.ts` を修正し、schema から citty の ArgsDef を構築する。

```typescript
// static schemaを読み取る
const getSchema = (commandClass: CommandClass): SchemaDefinition | undefined => {
  return (commandClass as unknown as { schema?: SchemaDefinition }).schema;
};

// args配列 → citty positional
const buildPositionalArgs = (args: readonly ArgDef[]): ArgsDef => {
  const result: ArgsDef = {};
  for (const arg of args) {
    result[arg.name] = { type: 'positional' };
  }
  return result;
};

// options配列 → citty options
const buildOptions = (options: readonly OptionDef[]): ArgsDef => {
  const result: ArgsDef = {};
  for (const opt of options) {
    if (opt.type === 'boolean') {
      result[opt.name] = { type: 'boolean', alias: opt.alias, default: opt.default as boolean };
    } else {
      result[opt.name] = { type: 'string', alias: opt.alias, default: opt.default as string };
    }
  }
  return result;
};

// number型の変換 (NaN検証付き)
const convertNumber = (
  value: unknown,
  name: string
): Result<number, { kind: 'INVALID_NUMBER'; name: string; value: unknown }> => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return err({ kind: 'INVALID_NUMBER', name, value });
  }
  return ok(num);
};

const convertNumbers = (
  parsed: Record<string, unknown>,
  schema: SchemaDefinition
): Result<Record<string, unknown>, { kind: 'INVALID_NUMBER'; name: string; value: unknown }> => {
  const result = { ...parsed };
  for (const arg of schema.args ?? []) {
    if (arg.type === 'number' && result[arg.name] !== undefined) {
      const converted = convertNumber(result[arg.name], arg.name);
      if (converted.isErr()) return converted;
      result[arg.name] = converted.value;
    }
  }
  for (const opt of schema.options ?? []) {
    if (opt.type === 'number' && result[opt.name] !== undefined) {
      const converted = convertNumber(result[opt.name], opt.name);
      if (converted.isErr()) return converted;
      result[opt.name] = converted.value;
    }
  }
  return ok(result);
};
```

## Files to Modify

| File | Action |
|------|--------|
| `packages/command/src/schema.ts` | **Create** - cliSchema(), 型定義 |
| `packages/command/src/primitives/args.ts` | **Create** - args() 関数 |
| `packages/command/src/internal/command-context.ts` | **Create** - AsyncLocalStorage |
| `packages/command/src/types.ts` | **Modify** - CommandClass型を更新、旧定義は非推奨 |
| `packages/command/src/index.ts` | **Modify** - 新しいexportを追加 |
| `packages/cli/src/commands/run/runner.ts` | **Modify** - static schemaをサポート |

## Breaking Changes

- `args` / `options` プロパティ → `static schema` に移行
- `run(ctx)` → `run(ctx = args(Command))` に移行
- 既存APIは当面維持し、新APIと並行サポート

## Verification

1. 既存テストが通ること: `pnpm test --filter @zeltjs/command`
2. 新APIのテストを追加
3. CLI runnerで新形式のコマンドが動作すること

## Implementation Steps (TDD順序)

### Phase 1: schema.ts
1. **Test**: `schema.test.ts` - "cliSchema returns input unchanged"
2. **Test**: `schema.test-d.ts` - 型テスト (vitest typecheck)
   - InferSchema が args/options の name をキーとして推論すること
   - optional arg は `T | undefined`、required arg は `T`
3. **Implement**: `schema.ts` - ArgDef, OptionDef, SchemaDefinition, cliSchema()

### Phase 2: command-context.ts
4. **Test**: `command-context.test.ts` - "getCommandContext throws outside context"
5. **Implement**: `command-context.ts` - AsyncLocalStorage

### Phase 3: args.ts
6. **Test**: `args.test.ts` - "args() retrieves parsedArgs from context"
7. **Implement**: `args.ts`

### Phase 4: runner.ts 更新
8. **Test**: `runner.test.ts` - "runCommand supports static schema"
   - 新schema形式でpositional args/optionsがパースされること
   - number型が正しく変換されること
   - NaN時にエラーが返ること
9. **Test**: `runner.test.ts` - "legacy args/options still work" (後方互換性)
10. **Implement**: `runner.ts`
    - `static schema` ありなら `runInCommandContext` で `run()` 引数なし呼び出し
    - legacy なら従来通り `run(ctx)` 呼び出し
    - args/options 名前衝突の runtime validation

### Phase 5: exports 更新
11. `types.ts` - CommandClass 型に static schema サポート
12. `index.ts` - cliSchema, args をエクスポート

## Runtime Validations

以下のバリデーションを runner 側で実装:
- args と options で同じ name が存在しないこと
- optional positional の後に required positional が来ないこと
- alias の重複がないこと
- name が空文字でないこと
