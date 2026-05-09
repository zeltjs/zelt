# Logger Enhancement Implementation Plan (Revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** zeltのLoggerを構造化ログ対応にし、Formatter/Transport分離アーキテクチャで拡張可能にする

**Architecture:** LogEntryを生成 → Formatterで文字列化 → Transportで出力。LoggerConfigでFormatterとTransportをDI経由で組み合わせる。withLogContextでAsyncLocalStorage経由のコンテキスト伝播、child()で子ロガー生成をサポート。

**Tech Stack:** TypeScript, vitest, needle-di, AsyncLocalStorage

**Review Feedback Applied:**
- 循環依存回避: `TransportBinding`を`logger.config.ts`に配置
- 同期Transport専用: `write(): void`（非同期は将来の拡張パッケージで対応）
- Testing Trophy準拠: ユニットテスト削減、統合テスト拡充
- 標準フィールド保護: contextより標準フィールドを優先
- Safe stringify: BigInt/循環参照対応

---

## File Structure

```
packages/core/src/modules/logger/
├── logger.lib.ts           # LogLevel, LogEntry, LogContext types (既存拡張)
├── logger.context.ts       # AsyncLocalStorage based context (新規)
├── formatter/
│   ├── formatter.types.ts  # LoggerFormatter interface
│   ├── jsonl.formatter.ts  # JSONL formatter with safe stringify
│   ├── pretty.formatter.ts # Pretty formatter for dev (TTY-aware)
│   └── index.ts
├── transport/
│   ├── transport.types.ts  # LoggerTransport interface (sync only)
│   ├── console.transport.ts # console.log based
│   └── index.ts
├── logger.config.ts        # LoggerConfig with TransportBinding (既存拡張)
├── logger.service.ts       # Logger service (既存大幅改修)
├── logger.service.test.ts  # Unit tests - minimal (既存拡張)
├── logger.integration.test.ts # Integration tests - primary (既存拡張)
└── index.ts                # Public exports (既存拡張)
```

---

### Task 1: LogEntry型とLogContext型の定義

**Files:**
- Modify: `packages/core/src/modules/logger/logger.lib.ts`

- [ ] **Step 1: logger.lib.tsにLogEntry型を追加**

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogContext = Readonly<Record<string, unknown>>;

export type LogEntry = {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly context: LogContext;
};

export const safeStringify = (value: unknown): string => {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  });
};
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/modules/logger/logger.lib.ts
git commit -m "feat(logger): add LogEntry, LogContext types with safe stringify"
```

---

### Task 2: LoggerFormatter interfaceの定義

**Files:**
- Create: `packages/core/src/modules/logger/formatter/formatter.types.ts`
- Create: `packages/core/src/modules/logger/formatter/index.ts`

- [ ] **Step 1: formatter.types.tsを作成**

```typescript
import type { LogEntry } from '../logger.lib';

export type LoggerFormatter = {
  format: (entry: LogEntry) => string;
};
```

- [ ] **Step 2: index.tsを作成**

```typescript
export type { LoggerFormatter } from './formatter.types';
```

- [ ] **Step 3: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/modules/logger/formatter/
git commit -m "feat(logger): add LoggerFormatter interface"
```

---

### Task 3: JsonlFormatterの実装

**Files:**
- Create: `packages/core/src/modules/logger/formatter/jsonl.formatter.ts`
- Create: `packages/core/src/modules/logger/formatter/jsonl.formatter.test.ts`
- Modify: `packages/core/src/modules/logger/formatter/index.ts`

- [ ] **Step 1: エッジケースの失敗するテストを書く**

`packages/core/src/modules/logger/formatter/jsonl.formatter.test.ts`:

```typescript
import { Container } from '@needle-di/core';
import { describe, it, expect } from 'vitest';

import type { LogEntry } from '../logger.lib';

import { JsonlFormatter } from './jsonl.formatter';

describe('JsonlFormatter', () => {
  it('standard fields take precedence over context', () => {
    const container = new Container();
    const formatter = container.get(JsonlFormatter);

    const entry: LogEntry = {
      level: 'info',
      message: 'test',
      timestamp: '2026-05-09T12:00:00.000Z',
      context: { level: 'MALICIOUS', message: 'OVERRIDE', extra: 'value' },
    };

    const result = formatter.format(entry);
    const parsed = JSON.parse(result);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test');
    expect(parsed.extra).toBe('value');
  });

  it('handles BigInt in context', () => {
    const container = new Container();
    const formatter = container.get(JsonlFormatter);

    const entry: LogEntry = {
      level: 'info',
      message: 'test',
      timestamp: '2026-05-09T12:00:00.000Z',
      context: { bigValue: BigInt(9007199254740991) },
    };

    const result = formatter.format(entry);
    const parsed = JSON.parse(result);

    expect(parsed.bigValue).toBe('9007199254740991');
  });

  it('handles circular references in context', () => {
    const container = new Container();
    const formatter = container.get(JsonlFormatter);

    const circular: Record<string, unknown> = { name: 'test' };
    circular.self = circular;

    const entry: LogEntry = {
      level: 'info',
      message: 'test',
      timestamp: '2026-05-09T12:00:00.000Z',
      context: circular,
    };

    expect(() => formatter.format(entry)).not.toThrow();
    const result = formatter.format(entry);
    expect(result).toContain('[Circular]');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @zeltjs/core test -- formatter/jsonl.formatter.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: JsonlFormatterを実装（標準フィールド優先 + safe stringify）**

`packages/core/src/modules/logger/formatter/jsonl.formatter.ts`:

```typescript
import { Injectable } from '../../../decorators/injectable';

import type { LogEntry } from '../logger.lib';
import { safeStringify } from '../logger.lib';

import type { LoggerFormatter } from './formatter.types';

@Injectable()
export class JsonlFormatter implements LoggerFormatter {
  format(entry: LogEntry): string {
    const { context, ...rest } = entry;
    return safeStringify({ ...context, ...rest });
  }
}
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `pnpm --filter @zeltjs/core test -- formatter/jsonl.formatter.test.ts`
Expected: PASS

- [ ] **Step 5: index.tsにexport追加**

```typescript
export type { LoggerFormatter } from './formatter.types';
export { JsonlFormatter } from './jsonl.formatter';
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/modules/logger/formatter/
git commit -m "feat(logger): implement JsonlFormatter with safe stringify"
```

---

### Task 4: PrettyFormatterの実装

**Files:**
- Create: `packages/core/src/modules/logger/formatter/pretty.formatter.ts`
- Modify: `packages/core/src/modules/logger/formatter/index.ts`

Note: PrettyFormatterの基本動作は統合テストでカバー。ユニットテストは最小限（TTY検出のエッジケースのみ）。

- [ ] **Step 1: PrettyFormatterを実装（TTY-aware）**

`packages/core/src/modules/logger/formatter/pretty.formatter.ts`:

```typescript
import { Injectable } from '../../../decorators/injectable';

import type { LogEntry, LogLevel } from '../logger.lib';
import { safeStringify } from '../logger.lib';

import type { LoggerFormatter } from './formatter.types';

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

const RESET = '\x1b[0m';

const isTTY = (): boolean =>
  typeof process !== 'undefined' &&
  process.stdout?.isTTY === true &&
  process.env.NO_COLOR === undefined;

@Injectable()
export class PrettyFormatter implements LoggerFormatter {
  format(entry: LogEntry): string {
    const { level, message, timestamp, context } = entry;
    const time = timestamp.slice(11, 19);
    const hasContext = Object.keys(context).length > 0;
    const contextStr = hasContext ? ` ${safeStringify(context)}` : '';

    if (isTTY()) {
      const color = COLORS[level];
      const levelTag = `${color}${level.toUpperCase().padEnd(5)}${RESET}`;
      return `${time} ${levelTag} ${message}${contextStr}`;
    }

    return `${time} ${level.toUpperCase().padEnd(5)} ${message}${contextStr}`;
  }
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 3: index.tsにexport追加**

```typescript
export type { LoggerFormatter } from './formatter.types';
export { JsonlFormatter } from './jsonl.formatter';
export { PrettyFormatter } from './pretty.formatter';
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/modules/logger/formatter/
git commit -m "feat(logger): implement PrettyFormatter with TTY-aware colors"
```

---

### Task 5: LoggerTransport interfaceの定義

**Files:**
- Create: `packages/core/src/modules/logger/transport/transport.types.ts`
- Create: `packages/core/src/modules/logger/transport/index.ts`

- [ ] **Step 1: transport.types.tsを作成（同期専用）**

```typescript
export type LoggerTransport = {
  write: (formatted: string) => void;
};
```

Note: 非同期Transportは将来の拡張パッケージ（@zelt/logger-s3等）でAsyncLoggerTransportとして提供予定。Coreは同期のみサポートし、エラーハンドリングの複雑性を回避。

- [ ] **Step 2: index.tsを作成**

```typescript
export type { LoggerTransport } from './transport.types';
```

- [ ] **Step 3: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/modules/logger/transport/
git commit -m "feat(logger): add LoggerTransport interface (sync only)"
```

---

### Task 6: ConsoleTransportの実装

**Files:**
- Create: `packages/core/src/modules/logger/transport/console.transport.ts`
- Modify: `packages/core/src/modules/logger/transport/index.ts`

Note: ConsoleTransportの動作は統合テストでカバー。薄いラッパーのため個別ユニットテストは不要（Testing Trophy準拠）。

- [ ] **Step 1: ConsoleTransportを実装**

`packages/core/src/modules/logger/transport/console.transport.ts`:

```typescript
import { Injectable } from '../../../decorators/injectable';

import type { LoggerTransport } from './transport.types';

@Injectable()
export class ConsoleTransport implements LoggerTransport {
  write(formatted: string): void {
    console.log(formatted);
  }
}
```

- [ ] **Step 2: index.tsにexport追加**

```typescript
export type { LoggerTransport } from './transport.types';
export { ConsoleTransport } from './console.transport';
```

- [ ] **Step 3: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/modules/logger/transport/
git commit -m "feat(logger): implement ConsoleTransport"
```

---

### Task 7: LogContextのAsyncLocalStorage管理

**Files:**
- Create: `packages/core/src/modules/logger/logger.context.ts`
- Create: `packages/core/src/modules/logger/logger.context.test.ts`

Note: 基本動作は統合テストでカバー。ユニットテストはコンテキストマージのエッジケースのみ（Testing Trophy準拠）。

- [ ] **Step 1: エッジケースの失敗するテストを書く**

`packages/core/src/modules/logger/logger.context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

import { getLogContext, withLogContext } from './logger.context';

describe('logger.context', () => {
  it('inner context overrides outer for same key', () => {
    const result = withLogContext({ key: 'outer' }, () => {
      return withLogContext({ key: 'inner' }, () => {
        return getLogContext();
      });
    });

    expect(result).toEqual({ key: 'inner' });
  });

  it('returns empty object outside withLogContext', () => {
    const result = getLogContext();
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @zeltjs/core test -- logger.context.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: logger.contextを実装**

`packages/core/src/modules/logger/logger.context.ts`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

import type { LogContext } from './logger.lib';

const storage = new AsyncLocalStorage<LogContext>();

export const getLogContext = (): LogContext => {
  return storage.getStore() ?? {};
};

export const withLogContext = <T>(ctx: LogContext, fn: () => T): T => {
  const current = getLogContext();
  const merged = { ...current, ...ctx };
  return storage.run(merged, fn);
};
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `pnpm --filter @zeltjs/core test -- logger.context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modules/logger/logger.context.ts packages/core/src/modules/logger/logger.context.test.ts
git commit -m "feat(logger): add withLogContext using AsyncLocalStorage"
```

---

### Task 8: TransportBinding型とLoggerConfigの更新

**Files:**
- Modify: `packages/core/src/modules/logger/logger.config.ts`

Note: 循環依存回避のため、`TransportBinding`は`logger.config.ts`に配置（`logger.lib.ts`からformatter/transportをimportしない）。

- [ ] **Step 1: LoggerConfigを更新（TransportBindingをここに定義）**

`packages/core/src/modules/logger/logger.config.ts`:

```typescript
import { Config } from '../../config';
import { inject } from '../../primitives/inject';

import type { LoggerFormatter } from './formatter';
import { JsonlFormatter } from './formatter';
import type { LogLevel } from './logger.lib';
import type { LoggerTransport } from './transport';
import { ConsoleTransport } from './transport';

export type TransportBinding = {
  readonly transport: LoggerTransport;
  readonly formatter: LoggerFormatter;
};

@Config
export class LoggerConfig {
  static readonly Token = LoggerConfig;

  private readonly _transports: readonly TransportBinding[];

  constructor(
    private console = inject(ConsoleTransport),
    private jsonl = inject(JsonlFormatter),
  ) {
    this._transports = Object.freeze([
      { transport: this.console, formatter: this.jsonl },
    ]);
  }

  get level(): LogLevel {
    return 'info';
  }

  get transports(): readonly TransportBinding[] {
    return this._transports;
  }
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/modules/logger/logger.config.ts
git commit -m "feat(logger): update LoggerConfig with TransportBinding (no circular dep)"
```

---

### Task 9: Logger serviceの改修とユニットテスト

**Files:**
- Modify: `packages/core/src/modules/logger/logger.service.ts`
- Modify: `packages/core/src/modules/logger/logger.service.test.ts`

Note: TDDサイクル維持のため、実装とテストを同一Taskで実施。ユニットテストはchild()のDI非管理の明示化など最小限に抑え、主要な振る舞いは統合テスト（Task 10）でカバー。

- [ ] **Step 1: child()のテストを書く（BoundLogger型で明示化）**

`packages/core/src/modules/logger/logger.service.test.ts`:

```typescript
import { Container } from '@needle-di/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Config } from '../../config';
import { inject } from '../../primitives/inject';

import { JsonlFormatter } from './formatter';
import { LoggerConfig, type TransportBinding } from './logger.config';
import type { LogLevel } from './logger.lib';
import { Logger } from './logger.service';
import { ConsoleTransport } from './transport';

describe('Logger', () => {
  const consoleSpy = vi.spyOn(console, 'log');

  beforeEach(() => {
    consoleSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockReset();
  });

  describe('child logger', () => {
    it('child inherits parent bindings and merges context', () => {
      const container = new Container();
      const logger = container.get(Logger);
      const child1 = logger.child({ service: 'auth' });
      const child2 = child1.child({ module: 'jwt' });

      child2.info('grandchild log');

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.service).toBe('auth');
      expect(logged.module).toBe('jwt');
    });

    it('child is not DI-managed (lightweight wrapper)', () => {
      const container = new Container();
      const logger = container.get(Logger);
      const child = logger.child({ service: 'test' });

      expect(child).not.toBe(logger);
      expect(child).toBeInstanceOf(Logger);
    });
  });

  describe('log level filtering', () => {
    it('uses O(1) priority lookup for level comparison', () => {
      @Config
      class WarnOnlyConfig extends LoggerConfig {
        override get level(): LogLevel {
          return 'warn';
        }
      }

      const container = new Container();
      container.bind({ provide: WarnOnlyConfig });
      container.bind({ provide: LoggerConfig, useExisting: WarnOnlyConfig });

      const logger = container.get(Logger);
      logger.debug('skip');
      logger.info('skip');
      logger.warn('log');
      logger.error('log');

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @zeltjs/core test -- logger.service.test.ts`
Expected: FAIL

- [ ] **Step 3: Logger serviceを改修**

`packages/core/src/modules/logger/logger.service.ts`:

```typescript
import { Injectable } from '../../decorators/injectable';
import { injectConfig } from '../../config';

import { getLogContext } from './logger.context';
import { LoggerConfig } from './logger.config';
import { LOG_LEVEL_PRIORITY, type LogContext, type LogEntry, type LogLevel } from './logger.lib';

@Injectable()
export class Logger {
  constructor(
    private config = injectConfig(LoggerConfig),
    private bindings: LogContext = {},
  ) {}

  debug(msg: string, ctx: LogContext = {}): void {
    this.log('debug', msg, ctx);
  }

  info(msg: string, ctx: LogContext = {}): void {
    this.log('info', msg, ctx);
  }

  warn(msg: string, ctx: LogContext = {}): void {
    this.log('warn', msg, ctx);
  }

  error(msg: string, ctx: LogContext = {}): void {
    this.log('error', msg, ctx);
  }

  child(bindings: LogContext): Logger {
    const merged = { ...this.bindings, ...bindings };
    return new Logger(this.config, merged);
  }

  private log(level: LogLevel, msg: string, ctx: LogContext): void {
    const configLevel = this.config.level;
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[configLevel]) {
      return;
    }

    const globalContext = getLogContext();
    const entry: LogEntry = {
      level,
      message: msg,
      timestamp: new Date().toISOString(),
      context: { ...globalContext, ...this.bindings, ...ctx },
    };

    for (const { transport, formatter } of this.config.transports) {
      const formatted = formatter.format(entry);
      transport.write(formatted);
    }
  }
}
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `pnpm --filter @zeltjs/core test -- logger.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modules/logger/logger.service.ts packages/core/src/modules/logger/logger.service.test.ts
git commit -m "feat(logger): refactor Logger with structured logging and child support"
```

---

### Task 10: 統合テストの拡充（Primary Test Coverage）

**Files:**
- Modify: `packages/core/src/modules/logger/logger.integration.test.ts`

Note: Testing Trophy準拠。主要な振る舞い（構造化ログ、withLogContext、複数Transport、Config切り替え）は統合テストでカバー。

- [ ] **Step 1: 既存統合テストを更新し新機能をカバー**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createHttpApp, Controller, Get, inject, Config, Middleware, type Next, type RequestContext } from '../../index';

import { JsonlFormatter, PrettyFormatter } from './formatter';
import { Logger, LoggerConfig, withLogContext, type TransportBinding } from './index';
import { ConsoleTransport } from './transport';

describe('Logger integration', () => {
  const consoleSpy = vi.spyOn(console, 'log');

  beforeEach(() => {
    consoleSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockReset();
  });

  describe('default behavior', () => {
    it('outputs structured JSON by default', async () => {
      @Controller('/test')
      class TestController {
        constructor(private logger = inject(Logger)) {}

        @Get('/')
        handle() {
          this.logger.info('hello', { action: 'test' });
          return { ok: true };
        }
      }

      const app = createHttpApp({
        controllers: [TestController],
      });
      await app.ready();

      const res = await app.request('/test');
      expect(res.status).toBe(200);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.level).toBe('info');
      expect(logged.message).toBe('hello');
      expect(logged.action).toBe('test');
      expect(logged.timestamp).toBeDefined();
    });
  });

  describe('withLogContext middleware integration', () => {
    it('propagates request context to all logs', async () => {
      @Middleware()
      class RequestContextMiddleware {
        handle(ctx: RequestContext, next: Next) {
          const requestId = 'req-' + Math.random().toString(36).slice(2);
          return withLogContext({ requestId }, () => next());
        }
      }

      @Controller('/test')
      class TestController {
        constructor(private logger = inject(Logger)) {}

        @Get('/')
        handle() {
          this.logger.info('request handled');
          return { ok: true };
        }
      }

      const app = createHttpApp({
        controllers: [TestController],
        middlewares: [RequestContextMiddleware],
      });
      await app.ready();

      const res = await app.request('/test');
      expect(res.status).toBe(200);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.requestId).toMatch(/^req-/);
    });
  });

  describe('custom config', () => {
    it('respects log level from custom config', async () => {
      @Config
      class ErrorOnlyConfig extends LoggerConfig {
        override get level(): 'debug' | 'info' | 'warn' | 'error' {
          return 'error';
        }
      }

      @Controller('/test')
      class TestController {
        constructor(private logger = inject(Logger)) {}

        @Get('/')
        handle() {
          this.logger.info('should not log');
          this.logger.error('should log');
          return { ok: true };
        }
      }

      const app = createHttpApp({
        controllers: [TestController],
        configs: [ErrorOnlyConfig],
      });
      await app.ready();

      const res = await app.request('/test');
      expect(res.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.level).toBe('error');
    });

    it('supports multiple transports with different formatters', async () => {
      const secondTransportWrite = vi.fn();

      @Config
      class MultiTransportConfig extends LoggerConfig {
        constructor(
          private consoleT = inject(ConsoleTransport),
          private jsonl = inject(JsonlFormatter),
          private pretty = inject(PrettyFormatter),
        ) {
          super(consoleT, jsonl);
        }

        override get transports(): readonly TransportBinding[] {
          return Object.freeze([
            { transport: this.consoleT, formatter: this.jsonl },
            { transport: { write: secondTransportWrite }, formatter: this.pretty },
          ]);
        }
      }

      @Controller('/test')
      class TestController {
        constructor(private logger = inject(Logger)) {}

        @Get('/')
        handle() {
          this.logger.info('multi transport');
          return { ok: true };
        }
      }

      const app = createHttpApp({
        controllers: [TestController],
        configs: [MultiTransportConfig],
      });
      await app.ready();

      await app.request('/test');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(secondTransportWrite).toHaveBeenCalledTimes(1);

      const jsonlOutput = consoleSpy.mock.calls[0][0];
      const prettyOutput = secondTransportWrite.mock.calls[0][0];

      expect(() => JSON.parse(jsonlOutput)).not.toThrow();
      expect(prettyOutput).toContain('INFO');
    });
  });

  describe('child logger', () => {
    it('child logger preserves bindings across requests', async () => {
      @Controller('/test')
      class TestController {
        private serviceLogger: Logger;

        constructor(private logger = inject(Logger)) {
          this.serviceLogger = this.logger.child({ service: 'user-service' });
        }

        @Get('/')
        handle() {
          this.serviceLogger.info('processing', { action: 'create' });
          return { ok: true };
        }
      }

      const app = createHttpApp({
        controllers: [TestController],
      });
      await app.ready();

      await app.request('/test');

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.service).toBe('user-service');
      expect(logged.action).toBe('create');
    });
  });
});
```

- [ ] **Step 2: テストがパスすることを確認**

Run: `pnpm --filter @zeltjs/core test -- logger.integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/modules/logger/logger.integration.test.ts
git commit -m "test(logger): add comprehensive integration tests for structured logging"
```

---

### Task 11: Public exportsの更新

**Files:**
- Modify: `packages/core/src/modules/logger/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: logger/index.tsを更新**

```typescript
export { Logger } from './logger.service';
export { LoggerConfig, type TransportBinding } from './logger.config';
export { withLogContext, getLogContext } from './logger.context';
export type { LogLevel, LogContext, LogEntry } from './logger.lib';
export { safeStringify } from './logger.lib';

export type { LoggerFormatter } from './formatter';
export { JsonlFormatter, PrettyFormatter } from './formatter';

export type { LoggerTransport } from './transport';
export { ConsoleTransport } from './transport';
```

- [ ] **Step 2: core/index.tsの既存export `Logger` を置換**

`packages/core/src/index.ts`の `export { Logger } from './modules/logger';` を以下に置換:

```typescript
export {
  Logger,
  LoggerConfig,
  withLogContext,
  getLogContext,
  safeStringify,
  JsonlFormatter,
  PrettyFormatter,
  ConsoleTransport,
} from './modules/logger';
export type {
  LogLevel,
  LogContext,
  LogEntry,
  TransportBinding,
  LoggerFormatter,
  LoggerTransport,
} from './modules/logger';
```

- [ ] **Step 3: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/modules/logger/index.ts packages/core/src/index.ts
git commit -m "feat(logger): export all logger types and utilities"
```

---

### Task 12: 全テスト実行と最終確認

**Files:**
- None (verification only)

- [ ] **Step 1: 全テスト実行**

Run: `pnpm --filter @zeltjs/core test`
Expected: All PASS

- [ ] **Step 2: TypeCheck**

Run: `pnpm --filter @zeltjs/core typecheck`
Expected: PASS

- [ ] **Step 3: Lint**

Run: `pnpm --filter @zeltjs/core lint`
Expected: PASS (or fix any issues)

- [ ] **Step 4: Build確認**

Run: `pnpm --filter @zeltjs/core build`
Expected: PASS

- [ ] **Step 5: Final Commit (if any fixes)**

```bash
git add -A
git commit -m "chore(logger): fix lint and build issues"
```

---

## Review Feedback Summary

以下のレビューフィードバックを本プランに反映済み:

### ts-reviewer
- ✅ 循環依存回避: `TransportBinding`を`logger.config.ts`に配置
- ✅ `LogContext`に`Readonly`追加
- ✅ O(1) log level比較（`LOG_LEVEL_PRIORITY`マップ）
- ✅ `transports` getterをキャッシュ（`_transports`フィールド）

### codex-reviewer
- ✅ 既存`logger.integration.test.ts`の更新
- ✅ 同期Transport専用（`void`のみ）
- ✅ 標準フィールド保護（`{ ...context, ...rest }`）
- ✅ Safe stringify（BigInt、循環参照対応）

### tdd-reviewer
- ✅ Testing Trophy準拠（ユニット削減、統合拡充）
- ✅ Task 9と10を統合（TDDサイクル維持）
- ✅ `createHttpApp`パターンを活用した統合テスト
- ✅ ConsoleTransport/logger.contextの個別テスト削減

### similarity-reviewer
- ✅ DIパターン（`@Injectable`, `@Config`）が既存コードと一致
- ✅ AsyncLocalStorageパターンは意図的に異なる設計で正当化

### 将来の検討事項（本プラン対象外）
- AsyncLocalStorageのCloudflare Workers互換性のドキュメント化
- 非同期Transportは`@zelt/logger-s3`等の拡張パッケージで対応

---

## Usage Examples (Reference)

### Basic Usage

```typescript
import { Logger, inject } from '@zeltjs/core';

@Controller('/users')
class UserController {
  constructor(private logger = inject(Logger)) {}

  @Get('/:id')
  getUser() {
    this.logger.info('Fetching user', { userId: pathParam('id') });
    // ...
  }
}
```

### With Context Propagation (Middleware)

```typescript
import { withLogContext, Middleware, type RequestContext, type Next } from '@zeltjs/core';

@Middleware()
class RequestContextMiddleware {
  handle(ctx: RequestContext, next: Next) {
    const requestId = crypto.randomUUID();
    return withLogContext({ requestId }, () => next());
  }
}
```

### Child Logger for Service-specific Context

```typescript
import { Logger, inject, Injectable } from '@zeltjs/core';

@Injectable()
class PaymentService {
  private logger: Logger;

  constructor(baseLogger = inject(Logger)) {
    this.logger = baseLogger.child({ service: 'payment' });
  }

  processPayment(orderId: string) {
    this.logger.info('Processing payment', { orderId });
  }
}
```

### Custom Config with Multiple Transports

```typescript
import {
  Config,
  inject,
  LoggerConfig,
  ConsoleTransport,
  JsonlFormatter,
  PrettyFormatter,
  EnvService,
  type TransportBinding,
} from '@zeltjs/core';

@Config
class MyLoggerConfig extends LoggerConfig {
  private readonly _transports: readonly TransportBinding[];

  constructor(
    private consoleT = inject(ConsoleTransport),
    private jsonl = inject(JsonlFormatter),
    private pretty = inject(PrettyFormatter),
    private env = inject(EnvService),
  ) {
    super(consoleT, jsonl);
    const isDev = this.env.getString('NODE_ENV', 'production') === 'development';
    this._transports = Object.freeze([
      { transport: this.consoleT, formatter: isDev ? this.pretty : this.jsonl },
    ]);
  }

  override get level() {
    return this.env.getString('LOG_LEVEL', 'info') as LogLevel;
  }

  override get transports(): readonly TransportBinding[] {
    return this._transports;
  }
}
```

### JSONL Output Example

```json
{"level":"info","message":"Fetching user","timestamp":"2026-05-09T12:00:00.000Z","requestId":"abc-123","userId":"42"}
```
