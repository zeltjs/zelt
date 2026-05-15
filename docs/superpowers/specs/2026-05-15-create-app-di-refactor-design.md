# createApp DI化リファクタリング設計

## 概要

`createApp` 周辺のコードをDIコンテナベースに書き換え、Zeltの既存パターン（Controller, Service）と統一する。

## 目的

- **一貫性**: フレームワーク内部もZeltスタイル（DI + デコレータ）で統一
- **保守性**: deps引き回しを解消し、変更を容易に
- **テスタビリティ**: 各モジュールを個別にテスト可能に

## スコープ

- `createApp` + 全モジュール（HttpModule, CommandModule, SchedulerModule, ConfigModule）をDI化
- 内部APIは一気に置換（互換維持しない）
- 利用者インターフェースは変更なし

## 設計

### 全体構造

```
createApp(options)
  │
  ├─ Container 作成
  │
  ├─ オプションを分割bind
  │   ├─ HTTP_OPTIONS (options.http)
  │   ├─ COMMAND_OPTIONS (options.commands)
  │   └─ SCHEDULER_OPTIONS (options.schedulers)
  │
  ├─ FWサービスをget（条件付き）
  │   ├─ AppRuntime（常に）
  │   ├─ HttpModule（options.http があれば）
  │   ├─ CommandModule（options.commands があれば）
  │   └─ SchedulerModule（options.schedulers があれば）
  │
  └─ App オブジェクトを返す
```

### Fragment的オプション分割

各モジュールは自分に必要なオプションだけを受け取る。

```typescript
const HTTP_OPTIONS = Symbol('HTTP_OPTIONS')
const COMMAND_OPTIONS = Symbol('COMMAND_OPTIONS')
const SCHEDULER_OPTIONS = Symbol('SCHEDULER_OPTIONS')

@Injectable()
class HttpModule {
  constructor(
    @Inject(HTTP_OPTIONS) private options: HttpOptions,
  ) {}
}
```

### 各サービスの責務

#### AppRuntime

App全体のライフサイクル統括（ready/shutdown状態管理）。

```typescript
@Injectable()
class AppRuntime {
  private state: 'idle' | 'ready' | 'disposed' = 'idle'
  private cachedResult: ReadyResult | undefined

  constructor(private lifecycleManager: LifecycleManager) {}

  async ready(options?: ReadyOptions): Promise<ReadyResult> {
    if (this.state === 'disposed') {
      throw new ZeltLifecycleStateError({ operation: 'ready', currentState: 'disposed' })
    }
    if (this.state === 'ready') {
      return this.cachedResult!
    }
    
    await this.lifecycleManager.startup()
    this.state = 'ready'
    this.cachedResult = this.buildReadyResult()
    return this.cachedResult
  }

  async shutdown(): Promise<void> {
    if (this.state === 'disposed') return
    this.state = 'disposed'
    await this.lifecycleManager.shutdown()
  }
}
```

#### HttpModule

HTTPリクエスト処理、ルーティング。

```typescript
@Injectable()
class HttpModule implements Lifecycle {
  constructor(
    @Inject(HTTP_OPTIONS) private options: HttpOptions,
    private lifecycleManager: LifecycleManager,
  ) {
    this.buildRoutes()
    lifecycleManager.register(this)
  }

  async startup(): Promise<void> { /* warmup等 */ }
  async shutdown(): Promise<void> { /* cleanup */ }

  fetch(request: Request): Promise<Response> { ... }
  request(input: string | Request, init?: RequestInit): Promise<Response> { ... }
  getControllers(): readonly ControllerClass[] { ... }
  getMetadata(): HttpMetadata { ... }
}
```

#### CommandModule / SchedulerModule

同様のパターン。それぞれコマンド管理、スケジューラ管理を担当。

#### ConfigRegistry

設定の登録・取得を管理。ready前に `addFallbackConfig` / `overrideConfig` が呼べる必要があるため、状態を持つ。

```typescript
@Injectable()
class ConfigRegistry {
  private defaults: ConfigClass<object>[] = []
  private overrides: ConfigClass<object>[] = []

  addFallbackConfig(config: ConfigClass<object>): void {
    this.defaults.push(config)
  }

  overrideConfig(config: ConfigClass<object>): void {
    this.overrides.push(config)
  }

  getDefaults(): readonly ConfigClass<object>[] { return this.defaults }
  getOverrides(): readonly ConfigClass<object>[] { return this.overrides }
}
```

AppRuntimeはready時にConfigRegistryからdefaults/overridesを取得してコンテナに反映する。

### ライフサイクル統合

各モジュールは `Lifecycle` インターフェースを実装し、コンストラクタで `LifecycleManager.register()` を呼ぶ。

```typescript
interface Lifecycle {
  startup(): Promise<void>
  shutdown(): Promise<void>
}
```

AppRuntimeは `LifecycleManager.startup()` / `shutdown()` を呼ぶだけで全モジュールを統括。

### 条件付きモジュール登録

```typescript
export function createApp(options: CreateAppOptions): App {
  const container = new Container()
  
  // 常に登録
  container.bind(AppRuntime)
  
  // 条件付き登録
  if (options.http) {
    container.bind({ provide: HTTP_OPTIONS, useValue: options.http })
    container.bind(HttpModule)
  }
  if (options.commands?.length) {
    container.bind({ provide: COMMAND_OPTIONS, useValue: options.commands })
    container.bind(CommandModule)
  }
  if (options.schedulers?.length) {
    container.bind({ provide: SCHEDULER_OPTIONS, useValue: options.schedulers })
    container.bind(SchedulerModule)
  }
  
  const runtime = container.get(AppRuntime)
  const httpModule = options.http ? container.get(HttpModule) : undefined
  // ...
  
  return { ... }
}
```

### 状態管理

AppRuntimeが `'idle' | 'ready' | 'disposed'` の状態を管理。これは避けられない複雑さとして許容。

## テスト戦略

### 各モジュール単体テスト

```typescript
const { target: httpModule, shutdown } = await createTestTarget(HttpModule, {
  overrides: [{ provide: HTTP_OPTIONS, useValue: { controllers: [TestController] } }]
})

expect(httpModule.getControllers()).toContain(TestController)
await shutdown()
```

### AppRuntime単体テスト

`createTestTarget` 使用可能。LifecycleManagerのstartedIndexにより二重起動は防止される。

### 統合テスト

既存の `createApp` テストは利用者インターフェースが変わらないのでそのまま動作。

## 削除されるもの

- `ReadyDeps`, `ShutdownDeps`, `AppModules` 型
- `createReady()`, `createShutdown()` 関数
- `createHttpModuleIfNeeded()`, `createCommandModuleIfNeeded()`, `createSchedulerModuleIfNeeded()` ヘルパー
- `collectAllModules()`, `buildAppObject()` 関数

## 利用者への影響

なし。`createApp` の引数と戻り値の型は変更なし。
