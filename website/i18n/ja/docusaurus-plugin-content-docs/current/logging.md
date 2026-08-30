---
---

# ロギング

Zeltは、構造化ログ、設定可能なtransport、コンテキスト伝播を備えた組み込みの `Logger` モジュールを提供します。

## 基本的な使い方 {#basic-usage}

`Logger` をserviceやcontrollerにinjectします:

```typescript
import { Injectable, inject, Logger } from '@zeltjs/core';

@Injectable()
export class OrderService {
  constructor(private logger = inject(Logger)) {}

  processOrder(orderId: string) {
    this.logger.info(`Processing order: ${orderId}`);

    try {
      // ... 注文を処理する
      this.logger.debug('Order validation passed');
    } catch (error) {
      this.logger.error(`Failed to process order: ${orderId}`);
      throw error;
    }
  }
}
```

## ログレベル {#log-levels}

Loggerは、深刻度の順に4つのログレベルをサポートします:

| レベル   | メソッド           | 説明                     |
| ------- | ---------------- | ------------------------------- |
| `debug` | `logger.debug()` | 詳細なデバッグ情報  |
| `info`  | `logger.info()`  | 一般的な情報メッセージ  |
| `warn`  | `logger.warn()`  | 警告メッセージ                |
| `error` | `logger.error()` | エラーメッセージ                  |

メッセージは、設定されたレベル以上の場合にのみ出力されます。例えば `level: 'info'` の場合、`debug()` メッセージは抑制されます。

## 構造化ログ {#structured-logging}

構造化データを含めるには、第2引数としてコンテキストを渡します:

```typescript
import { inject, Logger } from '@zeltjs/core';
const logger = inject(Logger);
const orderId = '123', userId = '456';
// ---cut---
logger.info('Order processed', { orderId, userId, duration: 150 });
// 出力: 13:45:23 INFO  Order processed {"orderId":"123","userId":"456","duration":150}
```

## 子Logger {#child-loggers}

すべてのログ呼び出しにわたって永続する、バインドされたコンテキストを持つ子loggerを作成します:

```typescript
import { Injectable, inject, Logger } from '@zeltjs/core';
// ---cut---
@Injectable()
export class OrderService {
  private logger: Logger;

  constructor(baseLogger = inject(Logger)) {
    this.logger = baseLogger.child({ service: 'OrderService' });
  }

  processOrder(orderId: string) {
    const orderLogger = this.logger.child({ orderId });
    orderLogger.info('Processing started');
    // 出力に含まれる: {"service":"OrderService","orderId":"123"}
  }
}
```

## withLogContextによるグローバルコンテキスト {#global-context-with-withlogcontext}

`AsyncLocalStorage` を使ってasyncの境界をまたいでコンテキストを伝播するには `withLogContext` を使います:

```typescript
import { withLogContext, Logger, inject } from '@zeltjs/core';

declare const someService: { process(): void };
// ---cut---
const logger = inject(Logger);

withLogContext({ requestId: 'abc-123' }, () => {
  logger.info('Request received');
  // このスコープ内のすべてのログには自動的にコンテキストが含まれる
  someService.process();
});
```

## 設定 {#configuration}

### 基本設定 {#basic-configuration}

`LoggerConfig` を使ってLoggerを設定します:

```typescript
import {
  Config,
  Env,
  inject,
  LoggerConfig,
  ConsoleTransport,
  JsonlFormatter,
  type LogLevel,
} from '@zeltjs/core';

type TransportBinding = { transport: { write(msg: string): void }; formatter: { format(entry: unknown): string } };
// ---cut---
@Config
export class AppLoggerConfig extends LoggerConfig {
  constructor(
    private env = inject(Env),
    private consoleTransport = inject(ConsoleTransport),
    private jsonlFormatter = inject(JsonlFormatter),
  ) {
    super();
  }

  override get level(): LogLevel {
    return (this.env.getString('LOG_LEVEL') as LogLevel) ?? 'info';
  }

  override get transports(): readonly TransportBinding[] {
    return [{ transport: this.consoleTransport, formatter: this.jsonlFormatter }];
  }
}
```

### PrettyFormatterの利用 {#using-prettyformatter}

開発環境で人間が読みやすい出力にするには、`PrettyFormatter` を使います:

```typescript
import {
  Config,
  inject,
  LoggerConfig,
  ConsoleTransport,
  PrettyFormatter,
} from '@zeltjs/core';

type TransportBinding = { transport: { write(msg: string): void }; formatter: { format(entry: unknown): string } };
// ---cut---
@Config
export class DevLoggerConfig extends LoggerConfig {
  constructor(
    private consoleTransport = inject(ConsoleTransport),
    private prettyFormatter = inject(PrettyFormatter),
  ) {
    super();
  }

  override get level() {
    return 'debug' as const;
  }

  override get transports(): readonly TransportBinding[] {
    return [{ transport: this.consoleTransport, formatter: this.prettyFormatter }];
  }
}
```

`PrettyFormatter` はTTY環境で色付きのログを出力します:

```
13:45:23 INFO  Order processed {"orderId":"123"}
13:45:23 ERROR Failed to process {"error":"timeout"}
```

アプリ作成時にconfigを登録します:

```typescript
import { createApp, Config, LoggerConfig, Controller, Get, http } from '@zeltjs/core';

@Config class AppLoggerConfig extends LoggerConfig {}
@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }
// ---cut---
const app = createApp([http({
    controllers: [AppController],
  })], { configs: [AppLoggerConfig] });
```

## TransportとFormatter {#transports-and-formatters}

Loggerはpluggableなtransport/formatterアーキテクチャを使用します:

| コンポーネント           | 説明                                    |
| ------------------- | ---------------------------------------------- |
| `ConsoleTransport`  | stdout/stderrへ書き込む                        |
| `JsonlFormatter`    | JSON Linesフォーマット(1行に1つのJSONオブジェクト)   |
| `PrettyFormatter`   | 色をオプションとする人間が読みやすいフォーマット     |

### カスタムTransport {#custom-transport}

カスタム出力先には `LoggerTransport` を実装します:

```typescript
import type { LoggerTransport } from '@zeltjs/core';

export class FileTransport implements LoggerTransport {
  write(message: string): void {
    // ファイルに書き込む
  }
}
```

### カスタムFormatter {#custom-formatter}

カスタム出力フォーマットには `LoggerFormatter` を実装します:

```typescript
import type { LoggerFormatter, LogEntry } from '@zeltjs/core';

export class CustomFormatter implements LoggerFormatter {
  format(entry: LogEntry): string {
    return `[${entry.level}] ${entry.message}`;
  }
}
```

## デフォルトの挙動 {#default-behavior}

カスタム設定がない場合:
- レベル: `'info'`(debugメッセージは抑制される)
- Transport: `ConsoleTransport`
- Formatter: `JsonlFormatter`
