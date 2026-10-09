---
---

# コマンド

Zeltは `@zeltjs/core` を通じて、依存性の注入付きのCLIコマンドサポートを提供します。

:::info[入力schemaの追加機能・未リリース]
必須オプション、可変長位置引数、schemaのunionによる排他、宣言外入力の拒否、ヘルプ生成については、[Command入力schemaの契約](./command-input-contract.md)を参照してください。これらの追加機能は `@zeltjs/core@0.11.0` には含まれていません。
:::

## Commandの作成 {#creating-a-command}

`cliSchema()` でモジュールレベルの定数としてスキーマを定義し、それを `@Command` デコレータを付けたクラス内で `args()` に渡すことで、型安全なCLIコマンドを作ります:

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';

const greetSchema = cliSchema({
  args: [{ name: 'name', type: 'string' }],
});

@Command({
  name: 'greet',
  description: 'Greet a user',
})
export class GreetCommand {
  run(ctx = args(greetSchema)) {
    console.log(`Hello, ${ctx.name}!`);
  }
}
```

## 設定 {#configuration}

CLI用の `src/cli.ts` エントリポイントを作成します:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

const greetSchema = cliSchema({ args: [{ name: 'name', type: 'string' }] });

@Command({ name: 'greet', description: 'Greet a user' })
class GreetCommand {
  run(ctx = args(greetSchema)) { console.log(`Hello, ${ctx.name}!`); }
}
// ---cut---
const app = createApp([command([GreetCommand])]);
const nodeApp = await onNode(app);
await nodeApp.commands.execCommand([...nodeApp.args]);
```

次に、`zelt.config.ts` で `cli.entry` を設定します:

```typescript
// @filename: src/app.ts
import { createApp, command } from '@zeltjs/core';

export const app = createApp([command([])]);

// @filename: zelt.config.ts
import { defineConfig } from '@zeltjs/cli';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  cli: { entry: './src/cli.ts' },
});
```

## Commandの実行 {#running-commands}

コマンドを実行するには `zelt run` を使います:

```bash
# コマンドを実行する
zelt run greet Alice

# カスタムconfigを使う
zelt run -c ./config/zelt.config.ts greet Alice
```

## スキーマ定義 {#schema-definition}

`cliSchema()` 関数は、型付きの引数とオプションを定義します。戻り値は単なる値なので、独立したモジュール(例: `greet-schema.lib.ts`)に宣言し、commandにimportして `args()` に渡します。argvは `args(schema)` が呼び出された時にパース・検証されます。宣言していないオプションや余分な位置引数は拒否され、入力エラーの場合は `run()` の本体には入りません。`args()` を呼ばないcommandへの自動検証は行いません。

### 位置引数 {#positional-arguments}

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const copySchema = cliSchema({
  args: [
    { name: 'source', type: 'string' },
    { name: 'destination', type: 'string' },
  ],
});

@Command({ name: 'copy' })
export class CopyCommand {
  run(ctx = args(copySchema)) {
    console.log(`Copying ${ctx.source} to ${ctx.destination}`);
  }
}
```

### オプション(フラグ) {#options-flags}

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const buildSchema = cliSchema({
  options: [
    { name: 'watch', type: 'boolean', alias: 'w' },
    { name: 'outDir', type: 'string', alias: 'o', default: 'dist' },
  ],
});

@Command({ name: 'build' })
export class BuildCommand {
  run(ctx = args(buildSchema)) {
    if (ctx.watch) {
      console.log('Watching for changes...');
    }
    console.log(`Output directory: ${ctx.outDir}`);
  }
}
```

```bash
# 使い方
zelt run build --watch --outDir=out
zelt run build -w -o out
```

### 引数とオプションの組み合わせ {#combined-arguments-and-options}

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const deploySchema = cliSchema({
  args: [
    { name: 'environment', type: 'string' },
  ],
  options: [
    { name: 'dryRun', type: 'boolean' },
    { name: 'tag', type: 'string' },
  ],
});

@Command({ name: 'deploy' })
export class DeployCommand {
  run(ctx = args(deploySchema)) {
    const { environment, dryRun, tag } = ctx;

    if (dryRun) {
      console.log(`[DRY RUN] Would deploy to ${environment}`);
    } else {
      console.log(`Deploying ${tag ?? 'latest'} to ${environment}`);
    }
  }
}
```

## 入力契約とヘルプ {#input-contract-and-help}

オプションの `required: true` は明示指定を要求し、`string` / `number` の入力型から `undefined` を除きます。位置引数の `variadic: { min, max }` は残りの値を配列として受け取ります。

```ts
import { Command, args, cliSchema, formatCommandHelp } from '@zeltjs/core';

const analyzeSchema = cliSchema({
  args: [{ name: 'directories', type: 'string', variadic: { min: 1 } }],
  options: [{ name: 'guide', type: 'string', required: true }],
});

@Command({ name: 'analyze' })
class AnalyzeCommand {
  run(input = args(analyzeSchema)) {
    // directories: string[], guide: string
    console.log(input.directories, input.guide);
  }
}

console.log(formatCommandHelp('analyze', analyzeSchema));
```

`cliUnion([schemaA, schemaB, ...])` は、有効な入力の選択肢を宣言します。入力全体を受理するschemaが一つだけの場合に成功し、入力型も各schemaのunionになります。排他の宣言例、個数の境界、入力エラー、ヘルプの表示内容は[入力schemaの契約](./command-input-contract.md)を参照してください。

## スキーマの型 {#schema-types}

### 引数の型 {#argument-types}

| 型 | 説明 |
|------|-------------|
| `string` | 文字列値 |
| `number` | 数値(自動的にパースされる) |

引数はoptionalとしてマークできます:

```typescript
import { cliSchema } from '@zeltjs/core';
// ---cut---
const schema = cliSchema({
  args: [
    { name: 'file', type: 'string' },
    { name: 'count', type: 'number', optional: true },
  ],
});
```

### オプションの型 {#option-types}

| 型 | 説明 |
|------|-------------|
| `string` | 文字列オプション |
| `number` | 数値オプション(自動的にパースされる) |
| `boolean` | 真偽値フラグ |

オプションにはデフォルト値を設定できます:

```typescript
import { cliSchema } from '@zeltjs/core';
// ---cut---
const schema = cliSchema({
  options: [
    { name: 'port', type: 'number', default: 3000 },
    { name: 'verbose', type: 'boolean' },  // デフォルトはfalse
  ],
});
```

## Transientスコープ {#transient-scope}

Commandは **transient** として登録されます — 実行のたびに新しいインスタンスが作成されます。これにより以下が保証されます:

- コマンド実行ごとにクリーンな状態
- 実行間で共有される可変状態がない
- `inject()` を通じて注入された依存関係はsingletonのまま

```typescript
import { Command, inject } from '@zeltjs/core';
declare class DatabaseService {}
// ---cut---
@Command({ name: 'process' })
export class ProcessCommand {
  private startTime = Date.now(); // 実行のたびに新しくなる

  constructor(private db = inject(DatabaseService)) {} // singletonで共有される

  run() {
    console.log(`Started at: ${this.startTime}`);
  }
}
```

## 依存性の注入 {#dependency-injection}

Commandは依存性の注入をサポートします:

```typescript
import { Command, cliSchema, args, inject } from '@zeltjs/core';
declare class DatabaseService { runMigrations(): Promise<void>; }
// ---cut---
const migrateSchema = cliSchema({
  options: [
    { name: 'force', type: 'boolean' },
  ],
});

@Command({ name: 'migrate' })
export class MigrateCommand {
  constructor(private readonly db = inject(DatabaseService)) {}

  async run(ctx = args(migrateSchema)) {
    if (ctx.force) {
      console.log('Force migration enabled');
    }
    await this.db.runMigrations();
    console.log('Migrations completed');
  }
}
```

### `inject()` と `args()` の呼び出し場所 {#where-to-call-inject-and-args}

`inject()` はconstructorで、`args()` は `run()` のデフォルト引数として呼び出します。`args()` が読み取るcommand contextは `run()` の実行中にしか存在しないため、constructorで `args()` を呼ぶと `ZeltContextNotAvailableError` がthrowされます。

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const greetSchema = cliSchema({ args: [{ name: 'name', type: 'string' }] });

@Command({ name: 'greet' })
export class GreetCommand {
  // ❌ まだcommand contextが無い — ZeltContextNotAvailableErrorがthrowされる
  constructor(private readonly ctx = args(greetSchema)) {}

  run() {
    console.log(`Hello, ${this.ctx.name}!`);
  }
}
```

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
const greetSchema = cliSchema({ args: [{ name: 'name', type: 'string' }] });

@Command({ name: 'greet' })
export class GreetCommand {
  // ✅ run()はcommand context内で実行される
  run(ctx = args(greetSchema)) {
    console.log(`Hello, ${ctx.name}!`);
  }
}
```

## プログラムからの実行 {#programmatic-execution}

Commandは `onNode()` を使ってプログラムから実行できます:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

const migrateSchema = cliSchema({ options: [{ name: 'force', type: 'boolean' }] });

@Command({ name: 'migrate' })
class MigrateCommand {
  run(ctx = args(migrateSchema)) {}
}
// ---cut---
const app = createApp([command([MigrateCommand])]);
const nodeApp = await onNode(app);

const result = await nodeApp.commands.execCommand(['migrate', '--force']);
console.log(`Exit code: ${result.exitCode}`);
```

## Async Command {#async-commands}

Commandはasyncにできます:

```typescript
import { Command } from '@zeltjs/core';
// ---cut---
@Command({ name: 'sync' })
export class SyncCommand {
  async run() {
    console.log('Starting sync...');
    await this.fetchData();
    await this.processData();
    console.log('Sync completed');
  }

  private async fetchData() {
    // ...
  }

  private async processData() {
    // ...
  }
}
```
