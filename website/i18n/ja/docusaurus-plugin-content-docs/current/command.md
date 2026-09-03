---
---

# コマンド

Zeltは `@zeltjs/core` を通じて、依存性の注入付きのCLIコマンドサポートを提供します。

## Commandの作成 {#creating-a-command}

型安全なCLIコマンドのために、`@Command` デコレータを `cliSchema()` と `args()` とともに使います:

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';

@Command({
  name: 'greet',
  description: 'Greet a user',
})
export class GreetCommand {
  static schema = cliSchema({
    args: [{ name: 'name', type: 'string' }],
  });

  run(ctx = args(GreetCommand)) {
    console.log(`Hello, ${ctx.name}!`);
  }
}
```

## 設定 {#configuration}

CLI用の `src/cli.ts` エントリポイントを作成します:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet', description: 'Greet a user' })
class GreetCommand {
  static schema = cliSchema({ args: [{ name: 'name', type: 'string' }] });
  run(ctx = args(GreetCommand)) { console.log(`Hello, ${ctx.name}!`); }
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

`cliSchema()` 関数は、型付きの引数とオプションを定義します:

### 位置引数 {#positional-arguments}

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
@Command({ name: 'copy' })
export class CopyCommand {
  static schema = cliSchema({
    args: [
      { name: 'source', type: 'string' },
      { name: 'destination', type: 'string' },
    ],
  });

  run(ctx = args(CopyCommand)) {
    console.log(`Copying ${ctx.source} to ${ctx.destination}`);
  }
}
```

### オプション(フラグ) {#options-flags}

```typescript
import { Command, cliSchema, args } from '@zeltjs/core';
// ---cut---
@Command({ name: 'build' })
export class BuildCommand {
  static schema = cliSchema({
    options: [
      { name: 'watch', type: 'boolean', alias: 'w' },
      { name: 'outDir', type: 'string', alias: 'o', default: 'dist' },
    ],
  });

  run(ctx = args(BuildCommand)) {
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
@Command({ name: 'deploy' })
export class DeployCommand {
  static schema = cliSchema({
    args: [
      { name: 'environment', type: 'string' },
    ],
    options: [
      { name: 'dryRun', type: 'boolean' },
      { name: 'tag', type: 'string' },
    ],
  });

  run(ctx = args(DeployCommand)) {
    const { environment, dryRun, tag } = ctx;

    if (dryRun) {
      console.log(`[DRY RUN] Would deploy to ${environment}`);
    } else {
      console.log(`Deploying ${tag ?? 'latest'} to ${environment}`);
    }
  }
}
```

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
@Command({ name: 'migrate' })
export class MigrateCommand {
  static schema = cliSchema({
    options: [
      { name: 'force', type: 'boolean' },
    ],
  });

  constructor(private readonly db = inject(DatabaseService)) {}

  async run(ctx = args(MigrateCommand)) {
    if (ctx.force) {
      console.log('Force migration enabled');
    }
    await this.db.runMigrations();
    console.log('Migrations completed');
  }
}
```

## プログラムからの実行 {#programmatic-execution}

Commandは `onNode()` を使ってプログラムから実行できます:

```typescript
import { createApp, Command, cliSchema, args, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
@Command({ name: 'migrate' })
class MigrateCommand {
  static schema = cliSchema({ options: [{ name: 'force', type: 'boolean' }] });
  run(ctx = args(MigrateCommand)) {}
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
