---
sidebar_position: 9
---

# 設定

Zeltは `@Config` デコレータと `injectConfig()` ヘルパーを使用した型安全な設定システムを提供します。

## 設定の定義

`@Config` デコレータを使用して設定クラスを定義します。各設定クラスには静的な `Token` プロパティが必要です：

```typescript
import { Config } from '@zeltjs/core';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  get host() {
    return process.env.DATABASE_HOST ?? 'localhost';
  }

  get port() {
    return Number(process.env.DATABASE_PORT ?? 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}
```

## 設定の使用

`injectConfig()` を使用してサービスやコントローラーに設定を注入します：

```typescript
import { Injectable, injectConfig } from '@zeltjs/core';
import { DatabaseConfig } from './database.config';

@Injectable()
export class DatabaseService {
  constructor(private config = injectConfig(DatabaseConfig)) {}

  connect() {
    return this.config.connectionString;
  }
}
```

## 設定の登録

HTTPアプリ作成時に設定クラスを登録します：

```typescript
import { createHttpApp } from '@zeltjs/core';
import { DatabaseConfig } from './database.config';
import { AppController } from './app.controller';

const app = createHttpApp({
  controllers: [AppController],
  configs: [DatabaseConfig],
});
```

## 設定のオーバーライド

テスト用に設定クラスを継承して値をオーバーライドできます：

```typescript
import { Config } from '@zeltjs/core';
import { DatabaseConfig } from './database.config';

@Config
export class TestDatabaseConfig extends DatabaseConfig {
  override get host() {
    return 'test-db';
  }

  override get port() {
    return 5433;
  }
}

// テストのセットアップ
const app = createHttpApp({
  controllers: [AppController],
  configs: [TestDatabaseConfig],
});
```

`Token` プロパティは親クラスから継承されるため、`injectConfig(DatabaseConfig)` はオーバーライドされた `TestDatabaseConfig` インスタンスを受け取ります。

## 環境ベースの設定

Zeltは環境変数用の組み込み設定クラスを提供します：

### ProcessEnvConfig

`process.env`から直接読み取ります：

```typescript
import { Config, ProcessEnvConfig, injectConfig } from '@zeltjs/core';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = injectConfig(ProcessEnvConfig)) {}

  get host() {
    return this.env.get('DATABASE_HOST') ?? 'localhost';
  }

  get port() {
    return Number(this.env.get('DATABASE_PORT') ?? 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}

// 両方の設定を登録
const app = createHttpApp({
  controllers: [AppController],
  configs: [ProcessEnvConfig, DatabaseConfig],
});
```

### DotEnvConfig

[dotenv](https://github.com/motdotla/dotenv)を使用して`.env`ファイルを読み込み、`process.env`から読み取ります：

```typescript
import { Config, DotEnvConfig, injectConfig } from '@zeltjs/core';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = injectConfig(DotEnvConfig)) {}

  get host() {
    return this.env.get('DATABASE_HOST') ?? 'localhost';
  }
}

// DotEnvConfigはコンストラクタで.envを読み込む
const app = createHttpApp({
  controllers: [AppController],
  configs: [DotEnvConfig, DatabaseConfig],
});
```

### カスタム環境ファイルパス

`DotEnvConfig`を継承してカスタムパスから読み込みます：

```typescript
import { Config, DotEnvConfig } from '@zeltjs/core';

@Config
export class MyEnvConfig extends DotEnvConfig {
  protected override readonly paths = ['.env', '.env.local'];
}
```

