---
title: Command API Improvement Design
date: 2026-05-09
status: draft
---

# Command API Improvement Design

## 背景

現在の `@zeltjs/command` の書き心地が Controller/Scheduler と異なり、冗長に感じる。

**現状の問題点:**
- `as const` が必要
- `args` / `options` プロパティが冗長
- Controller の `pathParam()` のようなヘルパー関数パターンと一貫性がない

**制約:**
- CLIの `--help` 表示のため、実行前にメタデータを取得する必要がある
- Controller と完全に同じ書き心地（runメソッドのデフォルト引数）は実現不可

## 目標

1. `@zeltjs/command` の書き心地を改善（`as const` 不要、ヘルパー関数パターン）
2. 将来的に別の書き心地パッケージを追加できる拡張ポイントを `@zeltjs/cli` に用意

## 設計

### 1. 共通インターフェース（`@zeltjs/cli`）

```typescript
// packages/cli/src/command-provider.ts

export type CommandHelpInfo = {
  name: string;
  description?: string;
  arguments: ReadonlyArray<{
    name: string;
    type: 'positional' | 'boolean' | 'string';
    description?: string;
    default?: unknown;
    required?: boolean;
    alias?: string;
  }>;
};

export type CommandProvider = {
  getHelpInfo(command: unknown): CommandHelpInfo;
  run(command: unknown, argv: string[]): Promise<void>;
};
```

**ポイント:**
- `command: unknown` により、クラスでも関数でも任意の形式に対応可能
- 各パッケージが `CommandProvider` を実装
- citty等の引数パーサーへの依存は各プロバイダー内に閉じ込められる

### 2. `@zeltjs/command` の改善

#### 2.1 ヘルパー関数

```typescript
// packages/command/src/helpers.ts

type PositionalDef = {
  readonly type: 'positional';
  readonly description?: string;
  readonly required?: boolean;
};

type BooleanDef = {
  readonly type: 'boolean';
  readonly alias?: string;
  readonly default?: boolean;
  readonly description?: string;
};

type StringDef = {
  readonly type: 'string';
  readonly alias?: string;
  readonly default?: string;
  readonly description?: string;
};

export const positional = (opts?: {
  description?: string;
  required?: boolean;
}): PositionalDef => ({
  type: 'positional',
  ...opts,
});

export const boolean = (opts?: {
  alias?: string;
  default?: boolean;
  description?: string;
}): BooleanDef => ({
  type: 'boolean',
  ...opts,
});

export const string = (opts?: {
  alias?: string;
  default?: string;
  description?: string;
}): StringDef => ({
  type: 'string',
  ...opts,
});

export const defineArgs = <T extends Record<string, PositionalDef | BooleanDef | StringDef>>(
  args: T
): T => args;
```

#### 2.2 新しい書き方

```typescript
import { Command, defineArgs, positional, boolean, string } from '@zeltjs/command';
import type { CommandContext } from '@zeltjs/command';

@Command({ name: 'deploy', description: 'Deploy the app' })
export class DeployCommand {
  args = defineArgs({
    environment: positional({ required: true, description: 'Target environment' }),
    dryRun: boolean({ alias: 'd', default: false, description: 'Dry run mode' }),
    format: string({ alias: 'f', default: 'json' }),
  });

  run(ctx: CommandContext<typeof this.args>) {
    const { environment, dryRun, format } = ctx.args;
    if (dryRun) console.log(`[DRY RUN] ${environment} (${format})`);
  }
}
```

**改善点:**
- `as const` 不要（ヘルパー関数が literal type を返す）
- `args` と `options` の区別なし（`positional` / `boolean` / `string` で区別）
- Controller の `pathParam()` と同じ関数呼び出しパターン

#### 2.3 CommandContext の型

```typescript
// packages/command/src/types.ts

type InferArgValue<T> = T extends { type: 'positional'; required: true }
  ? string
  : T extends { type: 'positional' }
    ? string | undefined
  : T extends { type: 'boolean'; default: boolean }
    ? boolean
  : T extends { type: 'boolean' }
    ? boolean | undefined
  : T extends { type: 'string'; default: string }
    ? string
  : T extends { type: 'string' }
    ? string | undefined
  : never;

export type CommandContext<TArgs extends Record<string, unknown>> = {
  readonly args: {
    [K in keyof TArgs]: InferArgValue<TArgs[K]>;
  };
};
```

#### 2.4 CommandProvider 実装

```typescript
// packages/command/src/provider.ts

import type { CommandProvider, CommandHelpInfo } from '@zeltjs/cli';
import { getCommandMetadata } from './internal/metadata';

export const createCommandProvider = (): CommandProvider => ({
  getHelpInfo(command: unknown): CommandHelpInfo {
    const cls = command as new (...args: never[]) => object;
    const meta = getCommandMetadata(cls);
    const instance = Object.create(cls.prototype) as {
      args?: Record<string, { type: string; description?: string; alias?: string; default?: unknown; required?: boolean }>;
    };

    const args = Object.entries(instance.args ?? {}).map(([name, def]) => ({
      name,
      type: def.type as 'positional' | 'boolean' | 'string',
      description: def.description,
      default: def.default,
      required: def.required,
      alias: def.alias,
    }));

    return {
      name: meta?.name ?? '',
      description: meta?.description,
      arguments: args,
    };
  },

  async run(command: unknown, argv: string[]): Promise<void> {
    // 既存の runner.ts のロジックを移植
  },
});
```

### 3. `@zeltjs/cli` の変更

```typescript
// packages/cli/src/commands/run.ts (変更後)

import type { CommandProvider } from '../command-provider';
import { createCommandProvider } from '@zeltjs/command';

// デフォルトプロバイダーとして @zeltjs/command を使用
const defaultProvider = createCommandProvider();

// 将来的にはconfigからプロバイダーを切り替え可能に
const getProvider = (): CommandProvider => defaultProvider;
```

### 4. 将来の拡張

別パッケージ（例: `@zeltjs/command-fn`）が異なる書き心地を提供可能:

```typescript
// 将来の @zeltjs/command-fn（例）
import type { CommandProvider } from '@zeltjs/cli';

export const createFnCommandProvider = (): CommandProvider => ({
  getHelpInfo(command: unknown) { /* 独自実装 */ },
  run(command: unknown, argv: string[]) { /* 独自実装 */ },
});
```

## 移行

### 後方互換性

- 既存の `args` / `options` プロパティ形式は引き続きサポート
- 新しいヘルパー関数は追加機能として提供
- `CommandProvider` の導入は内部リファクタリング、外部APIに影響なし

### 非推奨

なし（追加機能のみ）

## 実装順序

1. `@zeltjs/cli` に `CommandProvider` 型を追加
2. `@zeltjs/command` にヘルパー関数（`positional`, `boolean`, `string`, `defineArgs`）を追加
3. `@zeltjs/command` に `CommandContext` の型改善
4. `@zeltjs/command` に `createCommandProvider` を実装
5. `@zeltjs/cli` の `runner.ts` を `CommandProvider` 経由に変更
6. テスト・ドキュメント更新
