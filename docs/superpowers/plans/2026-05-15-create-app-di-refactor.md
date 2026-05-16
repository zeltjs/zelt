# createApp DI化リファクタリング実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `createApp`周辺のコードをDIコンテナベースに書き換え、deps引き回しを解消する

**Architecture:** フラット構造でAppRuntime + 各Module（Http/Command/Scheduler）をDIコンテナに登録。各モジュールはFragment的に自分に必要なオプションだけを受け取る。ライフサイクルはLifecycleManagerに統合。

**Tech Stack:** TypeScript, needle-di, Hono, Vitest

---

## ファイル構造

### 新規作成

| ファイル | 責務 |
|---------|------|
| `packages/core/src/app/tokens.ts` | DIトークン定義（HTTP_OPTIONS等） |
| `packages/core/src/app/app-runtime.ts` | AppRuntimeクラス |
| `packages/core/src/app/app-runtime.test.ts` | AppRuntimeのテスト |
| `packages/core/src/app/config-registry.ts` | ConfigRegistryクラス |
| `packages/core/src/app/config-registry.test.ts` | ConfigRegistryのテスト |

### 大幅修正

| ファイル | 変更内容 |
|---------|----------|
| `packages/core/src/app/create-app.ts` | 薄いブートストラップに書き換え |
| `packages/core/src/app/modules/http-module.ts` | DI化（@Injectable + Lifecycleインターフェース実装） |
| `packages/core/src/app/modules/command-module.ts` | DI化 |
| `packages/core/src/app/modules/scheduler-module.ts` | DI化 |

### 削除

| ファイル | 理由 |
|---------|------|
| `packages/core/src/app/modules/config-module.ts` | ConfigRegistryに置き換え |
| `packages/core/src/app/module.ts` | Moduleインターフェースは不要に（Lifecycle使用） |

---

## Task 1: DIトークン定義

**Files:**
- Create: `packages/core/src/app/tokens.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: トークンファイル作成**

```typescript
// packages/core/src/app/tokens.ts
import type { InjectionToken } from '@needle-di/core';

import type { HttpOptions } from './modules/http-module';
import type { CommandClass } from '../command/types';
import type { ConfigClass } from '../config';

export type SchedulerClass = new (...args: never[]) => object;

export const HTTP_OPTIONS: InjectionToken<HttpOptions> = Symbol('HTTP_OPTIONS');
export const COMMAND_OPTIONS: InjectionToken<readonly CommandClass[]> = Symbol('COMMAND_OPTIONS');
export const SCHEDULER_OPTIONS: InjectionToken<readonly SchedulerClass[]> = Symbol('SCHEDULER_OPTIONS');
export const APP_CONFIGS: InjectionToken<readonly ConfigClass<object>[]> = Symbol('APP_CONFIGS');
```

- [ ] **Step 2: ビルド確認**

Run: `pnpm --filter @zeltjs/core exec tsc --noEmit`
Expected: 成功

- [ ] **Step 3: コミット**

```bash
git add packages/core/src/app/tokens.ts
git commit -m "feat(core): add DI tokens for app modules"
```

---

## Task 2: ConfigRegistry作成

**Files:**
- Create: `packages/core/src/app/config-registry.ts`
- Create: `packages/core/src/app/config-registry.test.ts`

- [ ] **Step 1: テスト作成**

```typescript
// packages/core/src/app/config-registry.test.ts
import { describe, expect, it } from 'vitest';
import { Container } from '@needle-di/core';

import { ConfigRegistry } from './config-registry';

describe('ConfigRegistry', () => {
  it('should store and return fallback configs', () => {
    const container = new Container();
    const registry = container.get(ConfigRegistry);

    class TestConfig {}

    registry.addFallbackConfig(TestConfig);

    expect(registry.getDefaults()).toContain(TestConfig);
  });

  it('should store and return override configs', () => {
    const container = new Container();
    const registry = container.get(ConfigRegistry);

    class TestConfig {}

    registry.overrideConfig(TestConfig);

    expect(registry.getOverrides()).toContain(TestConfig);
  });

  it('should maintain order of configs', () => {
    const container = new Container();
    const registry = container.get(ConfigRegistry);

    class ConfigA {}
    class ConfigB {}

    registry.addFallbackConfig(ConfigA);
    registry.addFallbackConfig(ConfigB);

    const defaults = registry.getDefaults();
    expect(defaults[0]).toBe(ConfigA);
    expect(defaults[1]).toBe(ConfigB);
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `pnpm --filter @zeltjs/core test src/app/config-registry.test.ts`
Expected: FAIL - モジュールが見つからない

- [ ] **Step 3: ConfigRegistry実装**

```typescript
// packages/core/src/app/config-registry.ts
import { injectable } from '@needle-di/core';

import type { ConfigClass } from '../config';

@injectable()
export class ConfigRegistry {
  private readonly defaults: ConfigClass<object>[] = [];
  private readonly overrides: ConfigClass<object>[] = [];

  addFallbackConfig(config: ConfigClass<object>): void {
    this.defaults.push(config);
  }

  overrideConfig(config: ConfigClass<object>): void {
    this.overrides.push(config);
  }

  getDefaults(): readonly ConfigClass<object>[] {
    return this.defaults;
  }

  getOverrides(): readonly ConfigClass<object>[] {
    return this.overrides;
  }
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `pnpm --filter @zeltjs/core test src/app/config-registry.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/app/config-registry.ts packages/core/src/app/config-registry.test.ts
git commit -m "feat(core): add ConfigRegistry for DI-based config management"
```

---

## Task 3: AppRuntime作成

**Files:**
- Create: `packages/core/src/app/app-runtime.ts`
- Create: `packages/core/src/app/app-runtime.test.ts`

- [ ] **Step 1: テスト作成**

```typescript
// packages/core/src/app/app-runtime.test.ts
import { describe, expect, it, vi } from 'vitest';
import { Container } from '@needle-di/core';

import { AppRuntime } from './app-runtime';
import { ConfigRegistry } from './config-registry';
import { LifecycleManager } from '../lifecycle';
import { ZeltLifecycleStateError } from '../errors';

describe('AppRuntime', () => {
  it('should call lifecycle startup on ready', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    const result = await runtime.ready();

    expect(result).toBeDefined();
    expect(result.get).toBeTypeOf('function');
    expect(result.getConfig).toBeTypeOf('function');
  });

  it('should return cached result on second ready call', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    const result1 = await runtime.ready();
    const result2 = await runtime.ready();

    expect(result1).toBe(result2);
  });

  it('should throw on ready after disposed', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    await runtime.shutdown();

    await expect(runtime.ready()).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('should be idempotent on shutdown', async () => {
    const container = new Container();
    const runtime = container.get(AppRuntime);

    await runtime.ready();
    await runtime.shutdown();
    await runtime.shutdown();
  });

  it('should call lifecycle shutdown', async () => {
    const container = new Container();
    const lifecycle = container.get(LifecycleManager);
    const shutdownSpy = vi.spyOn(lifecycle, 'shutdown');
    const runtime = container.get(AppRuntime);

    await runtime.ready();
    await runtime.shutdown();

    expect(shutdownSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `pnpm --filter @zeltjs/core test src/app/app-runtime.test.ts`
Expected: FAIL - モジュールが見つからない

- [ ] **Step 3: AppRuntime実装**

```typescript
// packages/core/src/app/app-runtime.ts
import { Container, inject, injectable } from '@needle-di/core';

import type { ConfigClass } from '../config';
import { getConfig, overrideConfig, resolveConfig } from '../config';
import { resolve } from '../di/resolve';
import { ZeltLifecycleStateError } from '../errors';
import { LifecycleManager } from '../lifecycle';
import { ConfigRegistry } from './config-registry';
import { APP_CONFIGS } from './tokens';

type AppState = 'idle' | 'ready' | 'disposed';

export type ReadyOptions = {
  readonly warmup?: boolean;
};

export type ReadyResult = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => T;
  readonly getConfig: <T extends object>(configClass: ConfigClass<T>) => T;
};

@injectable()
export class AppRuntime {
  private state: AppState = 'idle';
  private cachedResult: ReadyResult | undefined;
  private readyPromise: Promise<ReadyResult> | undefined;

  constructor(
    private readonly container: Container,
    private readonly lifecycleManager: LifecycleManager,
    private readonly configRegistry: ConfigRegistry,
    @inject(APP_CONFIGS, { optional: true }) private readonly configs: readonly ConfigClass<object>[] = [],
  ) {}

  /** @throws {ZeltLifecycleStateError} */
  async ready(options?: ReadyOptions): Promise<ReadyResult> {
    if (this.state === 'disposed') {
      throw new ZeltLifecycleStateError({ operation: 'ready', currentState: 'disposed' });
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.doReady(options);
    return this.readyPromise;
  }

  private async doReady(_options?: ReadyOptions): Promise<ReadyResult> {
    this.bindConfigs();
    await this.lifecycleManager.startup();
    this.state = 'ready';
    this.cachedResult = this.buildReadyResult();
    return this.cachedResult;
  }

  private bindConfigs(): void {
    const allConfigs = [...this.configs, ...this.configRegistry.getOverrides()];
    const defaults = this.configRegistry.getDefaults();

    for (const config of allConfigs) {
      overrideConfig(this.container, config);
    }
    for (const config of defaults) {
      overrideConfig(this.container, config, { fallback: true });
    }
    for (const config of allConfigs) {
      resolveConfig(this.container, config);
    }
  }

  private buildReadyResult(): ReadyResult {
    return {
      get: <T extends object>(cls: new (...args: never[]) => T): T =>
        resolve(this.container, cls),
      getConfig: <T extends object>(configClass: ConfigClass<T>): T =>
        getConfig(this.container, configClass),
    };
  }

  async shutdown(): Promise<void> {
    if (this.state === 'disposed') {
      return;
    }
    this.state = 'disposed';

    if (this.readyPromise) {
      try {
        await this.readyPromise;
      } catch {
        // ready failed, ignore
      }
    }

    await this.lifecycleManager.shutdown();
  }

  /** @throws {ZeltLifecycleStateError} */
  assertCanModifyConfig(operation: string): void {
    if (this.state === 'disposed') {
      throw new ZeltLifecycleStateError({ operation, currentState: 'disposed' });
    }
    if (this.state === 'ready') {
      throw new ZeltLifecycleStateError({ operation, currentState: 'ready' });
    }
  }
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `pnpm --filter @zeltjs/core test src/app/app-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/core/src/app/app-runtime.ts packages/core/src/app/app-runtime.test.ts
git commit -m "feat(core): add AppRuntime for DI-based lifecycle management"
```

---

## Task 4: HttpModule DI化

**Files:**
- Modify: `packages/core/src/app/modules/http-module.ts`

- [ ] **Step 1: HttpModuleをクラスに変換**

```typescript
// packages/core/src/app/modules/http-module.ts
import { inject, injectable } from '@needle-di/core';
import { Hono } from 'hono';
import { match, P } from 'ts-pattern';

import type { ResolverHandle } from '../../di/container';
import { resolve } from '../../di/resolve';
import {
  ZeltContextNotAvailableError,
  ZeltDecoratorUsageError,
  ZeltLifecycleStateError,
} from '../../errors';
import { DefaultErrorHandler } from '../../http/default.error-handler';
import type { ControllerRouteInfo } from '../../http/internal/metadata';
import { collectControllerRouteInfo } from '../../http/internal/metadata';
import { buildRoutes, warmupControllers } from '../../http/internal/route-builder';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  RequestContext,
} from '../../http/middleware/types';
import type { Lifecycle } from '../../lifecycle';
import { LifecycleManager } from '../../lifecycle';
import { HTTP_OPTIONS } from '../tokens';

export type ControllerClass = new (...args: never[]) => object;

export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
};

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

import type { MiddlewareInput } from '../../http/middleware/types';
import type { Container } from '@needle-di/core';

const createErrorHandler =
  (errorHandlers: readonly ErrorHandlerInstance[], fallback: ErrorHandlerInstance) =>
  async (err: Error, c: RequestContext): Promise<Response> => {
    for (const handler of errorHandlers) {
      const result = await handler.onError(err, c);
      if (result) return result;
    }
    const fallbackResult = await fallback.onError(err, c);
    return (
      fallbackResult ??
      Response.json({ code: 'INTERNAL_ERROR', message: 'internal server error' }, { status: 500 })
    );
  };

const resolveErrorHandler = (
  cls: ErrorHandlerClass,
  container: Container,
): ErrorHandlerInstance => {
  return resolve(container, cls) as ErrorHandlerInstance;
};

const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  container: Container,
): ErrorHandlerInstance[] => classes.map((cls) => resolveErrorHandler(cls, container));

@injectable()
export class HttpModule implements Lifecycle {
  private hono: Hono | undefined;
  private resolver: ResolverHandle | undefined;

  constructor(
    @inject(HTTP_OPTIONS) private readonly options: HttpOptions,
    private readonly container: Container,
    private readonly lifecycleManager: LifecycleManager,
  ) {
    this.lifecycleManager.register(this);
  }

  async startup(): Promise<void> {
    this.resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T =>
        resolve(this.container, cls),
      getConfig: () => {
        throw new Error('getConfig not available in HttpModule startup');
      },
    };
    this.hono = this.setupHono();
  }

  async shutdown(): Promise<void> {
    this.hono = undefined;
  }

  private setupHono(): Hono {
    if (!this.resolver) {
      throw new ZeltLifecycleStateError({ operation: 'setupHono', currentState: 'not_ready' });
    }
    const hono = new Hono({ strict: false });
    const errorHandlers = resolveErrorHandlers(this.options.errorHandlers ?? [], this.container);
    const fallbackHandler = resolve(this.container, DefaultErrorHandler);
    hono.onError(createErrorHandler(errorHandlers, fallbackHandler));
    buildRoutes({
      hono,
      controllers: this.options.controllers,
      resolver: this.resolver,
      lifecycle: this.lifecycleManager,
      globalMiddlewares: this.options.middlewares ?? [],
    });
    return hono;
  }

  /** @throws {ZeltLifecycleStateError} */
  async fetch(req: Request): Promise<Response> {
    if (!this.hono) {
      throw new ZeltLifecycleStateError({ operation: 'fetch', currentState: 'not_ready' });
    }
    return this.hono.fetch(req);
  }

  request(input: string | Request, init?: RequestInit): Promise<Response> {
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return this.fetch(req);
  }

  getControllers(): readonly ControllerClass[] {
    return this.options.controllers;
  }

  getMetadata(): HttpMetadata {
    return {
      controllers: this.options.controllers.map(collectControllerRouteInfo),
    };
  }
}
```

- [ ] **Step 2: ビルド確認**

Run: `pnpm --filter @zeltjs/core exec tsc --noEmit`
Expected: 成功（警告は許容）

- [ ] **Step 3: コミット**

```bash
git add packages/core/src/app/modules/http-module.ts
git commit -m "refactor(core): convert HttpModule to DI-based class"
```

---

## Task 5: CommandModule DI化

**Files:**
- Modify: `packages/core/src/app/modules/command-module.ts`

- [ ] **Step 1: CommandModuleをクラスに変換**

```typescript
// packages/core/src/app/modules/command-module.ts
import { inject, injectable } from '@needle-di/core';

import { getCommandMetadata } from '../../command/metadata';
import type { CommandClass } from '../../command/types';
import { ZeltAppConfigurationError, ZeltDecoratorUsageError } from '../../errors';
import type { Lifecycle } from '../../lifecycle';
import { LifecycleManager } from '../../lifecycle';
import { COMMAND_OPTIONS } from '../tokens';

@injectable()
export class CommandModule implements Lifecycle {
  private readonly commandMap = new Map<string, CommandClass>();

  constructor(
    @inject(COMMAND_OPTIONS) private readonly commands: readonly CommandClass[],
    private readonly lifecycleManager: LifecycleManager,
  ) {
    this.lifecycleManager.register(this);
  }

  /** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError} */
  async startup(): Promise<void> {
    this.validateAndRegisterCommands();
  }

  async shutdown(): Promise<void> {
    this.commandMap.clear();
  }

  private validateAndRegisterCommands(): void {
    for (const cls of this.commands) {
      const meta = getCommandMetadata(cls);
      if (!meta) {
        throw new ZeltDecoratorUsageError({
          decoratorName: 'Command',
          reason: 'missing_decorator',
          targetName: cls.name,
        });
      }
      if (this.commandMap.has(meta.name)) {
        throw new ZeltAppConfigurationError({ reason: 'duplicate_command', details: meta.name });
      }
      this.commandMap.set(meta.name, cls);
    }
  }

  hasCommand(name: string): boolean {
    return this.commandMap.has(name);
  }

  getCommands(): ReadonlyMap<string, CommandClass> {
    return this.commandMap;
  }
}
```

- [ ] **Step 2: ビルド確認**

Run: `pnpm --filter @zeltjs/core exec tsc --noEmit`
Expected: 成功

- [ ] **Step 3: コミット**

```bash
git add packages/core/src/app/modules/command-module.ts
git commit -m "refactor(core): convert CommandModule to DI-based class"
```

---

## Task 6: SchedulerModule DI化

**Files:**
- Modify: `packages/core/src/app/modules/scheduler-module.ts`

- [ ] **Step 1: SchedulerModuleをクラスに変換**

```typescript
// packages/core/src/app/modules/scheduler-module.ts
import { Container, inject, injectable } from '@needle-di/core';

import { resolve } from '../../di/resolve';
import type { Lifecycle } from '../../lifecycle';
import { LifecycleManager } from '../../lifecycle';
import type { SchedulerRunner } from '../../scheduler/runner';
import { createSchedulerRunner } from '../../scheduler/runner';
import { SCHEDULER_OPTIONS } from '../tokens';

import { SchedulerClass } from '../tokens';

@injectable()
export class SchedulerModule implements Lifecycle {
  private runner: SchedulerRunner | undefined;

  constructor(
    @inject(SCHEDULER_OPTIONS) private readonly schedulers: readonly SchedulerClass[],
    private readonly container: Container,
    private readonly lifecycleManager: LifecycleManager,
  ) {
    this.lifecycleManager.register(this);
  }

  async startup(): Promise<void> {
    if (this.schedulers.length === 0) return;
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T =>
        resolve(this.container, cls),
      getConfig: () => {
        throw new Error('getConfig not available in SchedulerModule');
      },
    };
    this.runner = createSchedulerRunner(this.schedulers, resolver);
  }

  async shutdown(): Promise<void> {
    await this.stopScheduler();
  }

  async startScheduler(): Promise<void> {
    if (this.runner && !this.runner.isRunning()) {
      await this.runner.startup();
    }
  }

  async stopScheduler(): Promise<void> {
    if (this.runner?.isRunning()) {
      await this.runner.shutdown();
    }
  }
}
```

- [ ] **Step 2: ビルド確認**

Run: `pnpm --filter @zeltjs/core exec tsc --noEmit`
Expected: 成功

- [ ] **Step 3: コミット**

```bash
git add packages/core/src/app/modules/scheduler-module.ts
git commit -m "refactor(core): convert SchedulerModule to DI-based class"
```

---

## Task 7: createApp書き換え

**Files:**
- Modify: `packages/core/src/app/create-app.ts`

- [ ] **Step 1: createAppを薄いブートストラップに書き換え**

```typescript
// packages/core/src/app/create-app.ts
import { Container } from '@needle-di/core';

import type { CommandClass } from '../command/types';
import type { ConfigClass } from '../config';
import { ZeltAppConfigurationError, ZeltLifecycleStateError } from '../errors';
import { AppRuntime, type ReadyOptions, type ReadyResult } from './app-runtime';
import { ConfigRegistry } from './config-registry';
import { CommandModule } from './modules/command-module';
import type { ControllerClass, HttpMetadata, HttpOptions } from './modules/http-module';
import { HttpModule } from './modules/http-module';
import type { SchedulerClass } from './modules/scheduler-module';
import { SchedulerModule } from './modules/scheduler-module';
import { APP_CONFIGS, COMMAND_OPTIONS, HTTP_OPTIONS, SCHEDULER_OPTIONS } from './tokens';

// --- Types ---

export type CreateAppOptions = {
  readonly http?: HttpOptions;
  readonly commands?: readonly CommandClass[];
  readonly schedulers?: readonly SchedulerClass[];
  readonly configs?: readonly ConfigClass<object>[];
};

type BaseApp = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyResult>;
  readonly shutdown: () => Promise<void>;
  readonly addFallbackConfig: (config: ConfigClass<object>) => void;
  readonly overrideConfig: (config: ConfigClass<object>) => void;
};

type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
};

type SchedulerCapabilities = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
};

export type App<TOptions extends CreateAppOptions = CreateAppOptions> = BaseApp &
  (TOptions['http'] extends HttpOptions ? HttpCapabilities : object) &
  (TOptions['commands'] extends readonly CommandClass[] ? CommandCapabilities : object) &
  (TOptions['schedulers'] extends readonly SchedulerClass[] ? SchedulerCapabilities : object);

export type HttpApp = App<{ http: HttpOptions }>;

export type CommandApp = App<{ commands: readonly CommandClass[] }>;

export type SchedulerApp = App<{ schedulers: readonly SchedulerClass[] }>;

export { type ReadyOptions, type ReadyResult } from './app-runtime';

/** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp<TOptions extends CreateAppOptions>(options: TOptions): App<TOptions>;
/** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp(options: CreateAppOptions): App<CreateAppOptions> {
  if (!options.http && !options.commands?.length) {
    throw new ZeltAppConfigurationError({ reason: 'no_http_or_commands' });
  }

  const container = new Container();

  // Bind configs
  if (options.configs?.length) {
    container.bind({ provide: APP_CONFIGS, useValue: options.configs });
  }

  // Bind modules conditionally
  if (options.http) {
    container.bind({ provide: HTTP_OPTIONS, useValue: options.http });
  }
  if (options.commands?.length) {
    container.bind({ provide: COMMAND_OPTIONS, useValue: options.commands });
  }
  if (options.schedulers?.length) {
    container.bind({ provide: SCHEDULER_OPTIONS, useValue: options.schedulers });
  }

  // Get runtime and modules
  const runtime = container.get(AppRuntime);
  const configRegistry = container.get(ConfigRegistry);
  const httpModule = options.http ? container.get(HttpModule) : undefined;
  const commandModule = options.commands?.length ? container.get(CommandModule) : undefined;
  const schedulerModule = options.schedulers?.length ? container.get(SchedulerModule) : undefined;

  // Build app object
  const baseApp: BaseApp = {
    ready: (opts) => runtime.ready(opts),
    shutdown: () => runtime.shutdown(),
    addFallbackConfig: (config) => {
      runtime.assertCanModifyConfig('addFallbackConfig');
      configRegistry.addFallbackConfig(config);
    },
    overrideConfig: (config) => {
      runtime.assertCanModifyConfig('overrideConfig');
      configRegistry.overrideConfig(config);
    },
  };

  const httpMethods = httpModule
    ? {
        fetch: (req: Request) => httpModule.fetch(req),
        request: (input: string | Request, init?: RequestInit) => httpModule.request(input, init),
        getControllers: () => httpModule.getControllers(),
        getMetadata: () => httpModule.getMetadata(),
      }
    : {};

  const commandMethods = commandModule
    ? {
        hasCommand: (name: string) => commandModule.hasCommand(name),
        getCommands: () => commandModule.getCommands(),
      }
    : {};

  const schedulerMethods = schedulerModule
    ? {
        startScheduler: () => schedulerModule.startScheduler(),
        stopScheduler: () => schedulerModule.stopScheduler(),
      }
    : {};

  return { ...baseApp, ...httpMethods, ...commandMethods, ...schedulerMethods };
}
```

- [ ] **Step 2: ビルド確認**

Run: `pnpm --filter @zeltjs/core exec tsc --noEmit`
Expected: 成功

- [ ] **Step 3: コミット**

```bash
git add packages/core/src/app/create-app.ts
git commit -m "refactor(core): rewrite createApp as thin bootstrap using DI"
```

---

## Task 8: 不要ファイル削除とexport整理

**Files:**
- Delete: `packages/core/src/app/modules/config-module.ts`
- Delete: `packages/core/src/app/module.ts`
- Modify: `packages/core/src/app/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: config-module.ts削除**

Run: `rm packages/core/src/app/modules/config-module.ts`

- [ ] **Step 2: module.ts削除**

Run: `rm packages/core/src/app/module.ts`

- [ ] **Step 3: app/index.ts更新**

```typescript
// packages/core/src/app/index.ts
export {
  type App,
  type CommandApp,
  type CreateAppOptions,
  createApp,
  type HttpApp,
  type ReadyOptions,
  type ReadyResult,
  type SchedulerApp,
} from './create-app';
export { AppRuntime } from './app-runtime';
export { ConfigRegistry } from './config-registry';
export { APP_CONFIGS, COMMAND_OPTIONS, HTTP_OPTIONS, SCHEDULER_OPTIONS } from './tokens';
```

- [ ] **Step 4: ビルド確認**

Run: `pnpm --filter @zeltjs/core exec tsc --noEmit`
Expected: 成功

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "refactor(core): remove deprecated module files and update exports"
```

---

## Task 9: 統合テスト実行

**Files:**
- Test: `packages/core/src/http/app.test.ts`
- Test: `packages/core/src/app/app.test.ts`

- [ ] **Step 1: coreパッケージの全テスト実行**

Run: `pnpm --filter @zeltjs/core test`
Expected: 全テストPASS

- [ ] **Step 2: 失敗したテストがあれば修正**

テスト結果を確認し、失敗があれば原因を調査して修正する。

- [ ] **Step 3: 全パッケージのテスト実行**

Run: `pnpm test`
Expected: 全テストPASS

- [ ] **Step 4: コミット（修正があれば）**

```bash
git add -A
git commit -m "fix(core): fix integration issues after DI refactor"
```

---

## Task 10: Lint/型チェック最終確認

- [ ] **Step 1: 型チェック**

Run: `pnpm typecheck`
Expected: 成功

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 成功（または許容可能な警告のみ）

- [ ] **Step 3: 最終コミット**

```bash
git add -A
git commit -m "chore(core): finalize DI refactor for createApp"
```
