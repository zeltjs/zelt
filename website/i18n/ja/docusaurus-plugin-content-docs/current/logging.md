---
sidebar_position: 10
---

# ロギング

Zeltは設定可能なログレベルを持つ組み込み`Logger`モジュールを提供します。

## 基本的な使い方

サービスやコントローラーに`Logger`を注入：

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { Logger } from '@zeltjs/core/modules/logger';

@Injectable()
export class OrderService {
  constructor(private logger = inject(Logger)) {}

  processOrder(orderId: string) {
    this.logger.info(`Processing order: ${orderId}`);

    try {
      // ... 注文を処理
      this.logger.debug('Order validation passed');
    } catch (error) {
      this.logger.error(`Failed to process order: ${orderId}`);
      throw error;
    }
  }
}
```

## ログレベル

Loggerは重要度順に4つのログレベルをサポート：

| レベル   | メソッド           | 説明                     |
| ------- | ---------------- | ------------------------------- |
| `debug` | `logger.debug()` | 詳細なデバッグ情報  |
| `info`  | `logger.info()`  | 一般的な情報メッセージ  |
| `warn`  | `logger.warn()`  | 警告メッセージ                |
| `error` | `logger.error()` | エラーメッセージ                  |

メッセージは設定されたレベル以上の場合のみ出力されます。例えば、`level: 'info'`では`debug()`メッセージは抑制されます。

## 設定

`LoggerConfig`を使用してLoggerを設定：

```typescript
import { Config } from '@zeltjs/core';
import { LoggerConfig } from '@zeltjs/core/modules/logger';

@Config
export class AppLoggerConfig extends LoggerConfig {
  override get level(): 'debug' | 'info' | 'warn' | 'error' {
    return process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' ?? 'info';
  }
}
```

アプリ作成時に設定を登録：

```typescript
import { createHttpApp } from '@zeltjs/core';
import { AppLoggerConfig } from './logger.config';
import { AppController } from './app.controller';

const app = createHttpApp({
  controllers: [AppController],
  configs: [AppLoggerConfig],
});
```

## デフォルト動作

カスタム設定なしの場合、Loggerはデフォルトレベルとして`'info'`を使用します。つまり`debug()`メッセージは抑制され、`info()`、`warn()`、`error()`メッセージは出力されます。
