# createApp 構造変更: http/cli 分離

## Context

現在の `createHttpApp` は HTTP 専用の API で、CLI コマンドを統合するには構造が不適切。
ユーザーとの議論で、以下の新構造に決定：

```ts
createApp({
  http: { controllers, middlewares, errorHandlers },
  commands: [],
  schedulers: [],
  configs: [],
})
```

- `createHttpApp` は廃止、`createApp` に一本化
- `@zeltjs/command` を core に統合
- `onNode(app).listen()` で HTTP、`onNode(app).exec()` で CLI

---

## Implementation Plan

### Phase 1: Command を core に移動

**Move files from @zeltjs/command:**

| Source | Destination |
|--------|-------------|
| `packages/command/src/decorators/command.ts` | `packages/core/src/command/decorator.ts` |
| `packages/command/src/internal/metadata.ts` | `packages/core/src/command/metadata.ts` |
| `packages/command/src/types.ts` | `packages/core/src/command/types.ts` |
| `packages/command/src/decorators/command.test.ts` | `packages/core/src/command/decorator.test.ts` |
| `packages/command/src/internal/metadata.test.ts` | `packages/core/src/command/metadata.test.ts` |

**Create index:**
- `packages/core/src/command/index.ts` - re-exports

**Update core exports:**
- `packages/core/src/index.ts` - add Command, CommandClass, CommandContext, getCommandMetadata, etc.

### Phase 2: 新しい型定義

**Create `packages/core/src/app/types.ts`:**

```ts
export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
};

export type CreateAppOptions = {
  readonly http?: HttpOptions;
  readonly commands?: readonly CommandClass[];
  readonly schedulers?: readonly SchedulerClass[];
  readonly configs?: readonly ConfigClass[];
};

// Base app methods (always available)
type BaseApp = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyResult>;
  readonly shutdown: () => Promise<void>;
  readonly hasConfig: (token: ConfigClass) => boolean;
  readonly replaceConfig: (token: ConfigClass, replacement: ConfigClass) => void;
};

// HTTP capabilities (http option 提供時のみ)
type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

// Command capabilities (commands option 提供時のみ)
type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
};

// Conditional type: オプションに応じて型を変える
export type App<TOptions extends CreateAppOptions = CreateAppOptions> = BaseApp
  & (TOptions['http'] extends HttpOptions ? HttpCapabilities : object)
  & (TOptions['commands'] extends readonly CommandClass[] ? CommandCapabilities : object);
```

**Validation at createApp() time:**
- `@Command` metadata がない class はエラー
- 同名 command がある場合はエラー（fail-fast）
- http も commands もない場合はエラー（schedulers/configs のみは無効）

### Phase 3: createApp 実装

**Create `packages/core/src/app/create-app.ts`:**

1. 既存の `buildApp` ロジックを共通化
2. HTTP 初期化（http option がある場合のみ）
3. Command 登録（commands option がある場合のみ）
4. Scheduler、Config、Lifecycle は既存ロジックを再利用

**Refactor `packages/core/src/http/app.ts`:**
- `setupHono` を抽出して再利用
- `createHttpApp` を削除

### Phase 4: adapter-node 更新

**Update `packages/adapter-node/src/on-node.ts`:**

```ts
export type NodeApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => T;
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
  readonly exec: (argv: string[]) => Promise<ExecResult>;
  readonly shutdown: () => Promise<void>;
};

export type ExecResult = {
  readonly exitCode: 0 | 1;
};
```

**exec() の設計:**
- `argv[0]` が command 名、残りが引数（例: `['migrate', '--force']`）
- **App の resolver を使用** - `ready()` 後の `builtApp.resolver.get(CommandClass)` で command を解決
- 新しい Container を作らない（HTTP handlers と同じ DI context を共有）
- Command 実行には `citty` の parseArgs を使用（既存 CLI ロジックを抽出して共用）

**Command 実行ロジックの抽出:**
- `packages/core/src/command/executor.ts` - command 実行の共通ロジック
- `packages/core/src/command/parser.ts` - citty を使った引数解析
- CLI と adapter-node の両方がこれらを使用

### Phase 5: 全パッケージ更新

**Migration scope（`rg "createHttpApp|HttpApp|CreateHttpAppOptions"` で検出）:**

| Package | Files to update |
|---------|-----------------|
| `examples/hello` | `src/app.ts` |
| `examples/drizzle-todo` | `src/app.ts` |
| `examples/workers-url-shortener` | `src/app.ts` |
| `packages/adapter-cloudflare-workers` | `src/*.ts` - App type 対応 |
| `packages/testing` | `src/*.ts` - App type 対応 |
| `packages/auth-jwt` | `src/*.test.ts` |
| `packages/auth-session` | `src/*.test.ts` |
| `packages/rate-limit` | `src/*.test.ts` |

**Before:**
```ts
export const app = createHttpApp({
  controllers,
  middlewares: [loggingMiddleware],
});
```

**After:**
```ts
export const app = createApp({
  http: {
    controllers,
    middlewares: [loggingMiddleware],
  },
});
```

### Phase 6: CLI 更新

**CLI 実行モデルの決定:**
- `zelt run <command>` は app entry を読み込み、`onNode(app).exec(argv)` を呼ぶ
- 従来の glob-based config (`commands: 'src/commands/**/*.ts'`) は **廃止**
- Command は必ず `createApp({ commands: [...] })` で登録

**Update `packages/cli/src/commands/run/`:**
- `@zeltjs/command` のインポートを `@zeltjs/core` に変更
- loader.ts - glob ベースの command 探索を削除、app entry から読み込み
- runner.ts - 独自 Container 作成を削除、`onNode(app).exec()` を使用

### Phase 7: @zeltjs/command パッケージ削除

- `packages/command/` ディレクトリを削除
- `pnpm-workspace.yaml` から削除（不要なら）
- CLI 等の依存関係から `@zeltjs/command` を削除

---

## Critical Files

| File | Action |
|------|--------|
| `packages/core/src/http/app.ts` | Refactor: extract shared logic, remove createHttpApp |
| `packages/core/src/app/types.ts` | Create: new type definitions (conditional types) |
| `packages/core/src/app/create-app.ts` | Create: new createApp implementation |
| `packages/core/src/command/` | Create: move from @zeltjs/command |
| `packages/core/src/command/executor.ts` | Create: command 実行の共通ロジック |
| `packages/core/src/command/parser.ts` | Create: citty を使った引数解析 |
| `packages/core/src/index.ts` | Update: add new exports |
| `packages/adapter-node/src/on-node.ts` | Update: add exec(), accept App type |
| `packages/adapter-cloudflare-workers/src/*.ts` | Update: App type 対応 |
| `packages/testing/src/*.ts` | Update: App type 対応 |
| `packages/cli/src/commands/run/*.ts` | Update: use onNode(app).exec() |
| `examples/*/src/app.ts` | Update: use createApp |

---

## Verification

### Test Cases (TDD: 各 Phase で先にテストを書く)

**createApp() tests:**
- `createApp({ http: ... })` - HTTP only, command methods なし
- `createApp({ commands: ... })` - CLI only, HTTP methods なし
- `createApp({ http: ..., commands: ... })` - both enabled
- `createApp({ configs: ... })` のみ - エラー（http か commands 必須）
- `@Command` metadata がない class - エラー
- 同名 command - エラー

**exec() tests:**
- 正常実行 - `{ exitCode: 0 }`
- command not found - `{ exitCode: 1 }`
- parse error - `{ exitCode: 1 }`
- execution error - `{ exitCode: 1 }`
- **DI container 共有** - HTTP handler と同じ service instance を使用

**Backward compatibility tests:**
- 既存テストが新 API で動作することを確認

### Commands

1. **Unit tests**: `pnpm -F @zeltjs/core test`
2. **Integration tests**: `pnpm -F @zeltjs/adapter-node test`
3. **Type check**: `pnpm typecheck`
4. **Full build**: `pnpm build`
5. **Examples**: 各 example の build と起動確認
6. **CLI**: `pnpm -F @zeltjs/cli test`
