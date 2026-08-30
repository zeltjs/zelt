---
---

# Configuration

Zeltは、`@Config`デコレータと`inject()`ヘルパーを使った型安全な設定システムを提供します。

## Defining Configuration {#defining-configuration}

設定クラスを定義するには`@Config`デコレータを使います。各configクラスは静的な`Token`プロパティを持つ必要があります:

```typescript
import { Config, Env, inject } from '@zeltjs/core';

@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = inject(Env)) {}

  get host() {
    return this.env.getString('DATABASE_HOST', 'localhost');
  }

  get port() {
    return this.env.getNumber('DATABASE_PORT', 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}
```

## Using Configuration {#using-configuration}

`inject()`を使って、serviceやcontrollerへ設定を注入します:

```typescript
import { Injectable, inject, Config, Env } from '@zeltjs/core';

@Config
class DatabaseConfig {
  static readonly Token = DatabaseConfig;
  constructor(private env = inject(Env)) {}
  get host() { return this.env.getString('DATABASE_HOST', 'localhost'); }
  get port() { return this.env.getNumber('DATABASE_PORT', 5432); }
  get connectionString() { return `postgres://${this.host}:${this.port}/mydb`; }
}
// ---cut---
@Injectable()
export class DatabaseService {
  constructor(private config = inject(DatabaseConfig)) {}

  connect() {
    return this.config.connectionString;
  }
}
```

## Registering Configuration {#registering-configuration}

アプリ作成時にconfigクラスを登録します:

```typescript
import { createApp, Config, Env, inject, Controller, Get, http } from '@zeltjs/core';

@Config
class DatabaseConfig {
  static readonly Token = DatabaseConfig;
  constructor(private env = inject(Env)) {}
  get host() { return this.env.getString('DATABASE_HOST', 'localhost'); }
  get port() { return this.env.getNumber('DATABASE_PORT', 5432); }
  get connectionString() { return `postgres://${this.host}:${this.port}/mydb`; }
}
@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }
// ---cut---
const app = createApp([http({
    controllers: [AppController],
  })], { configs: [DatabaseConfig] });
```

## Overriding Configuration {#overriding-configuration}

configクラスを継承することで、テスト用に設定値をオーバーライドできます:

```typescript
import { Config, createApp, Env, inject, http } from '@zeltjs/core';
declare class AppController {}
@Config
class DatabaseConfig {
  static readonly Token = DatabaseConfig;
  constructor(private env = inject(Env)) {}
  get host() { return this.env.getString('DATABASE_HOST', 'localhost'); }
  get port() { return this.env.getNumber('DATABASE_PORT', 5432); }
  get connectionString() { return `postgres://${this.host}:${this.port}/mydb`; }
}
// ---cut---
@Config
export class TestDatabaseConfig extends DatabaseConfig {
  override get host() {
    return 'test-db';
  }

  override get port() {
    return 5433;
  }
}

// テストのセットアップ内
const app = createApp([http({
    controllers: [AppController],
  })], { configs: [TestDatabaseConfig] });
```

`Token`プロパティは親クラスから継承されるため、`inject(DatabaseConfig)`はオーバーライドされた`TestDatabaseConfig`のインスタンスを受け取ります。

## Abstract Configuration {#abstract-configuration}

デフォルト実装を持たないconfigベースクラスを宣言するには`@Config({ abstract: true })`を使います。これは、意味のあるフォールバック値が存在せず、全ての環境で具体的な値を供給しなければならないconfig契約に便利です:

```typescript
import { Config, createApp } from '@zeltjs/core';

@Config({ abstract: true })
export abstract class PaymentGatewayConfig {
  abstract get apiKey(): string;
}

export class StripeConfig extends PaymentGatewayConfig {
  override get apiKey() {
    return 'sk_test_...';
  }
}
// ---cut---
const app = createApp([], { configs: [StripeConfig] });
```

abstract configが、それを解決する具象サブクラスなしに登録された場合 — 未登録のまま、`configs`へ直接渡された、あるいはabstractなサブクラスのみで解決された場合のいずれでも — `createRuntime()`(またはそのtokenの最初の`inject()`)は理由`abstract_leaf_without_concrete`とともに`ZeltAppConfigurationError`を投げます。

### Fallback Configuration {#fallback-configuration}

`createRuntime({ fallbackConfigs })`は、他に何もベースconfigを解決しない場合にのみ適用されるconfigサブクラスを登録します。解決の優先順位は、高い方から順に:

1. `createRuntime({ configs })` — runtimeオーバーライド
2. `createApp([...], { configs })` — ユーザー指定
3. `createRuntime({ fallbackConfigs })` — フォールバック
4. ベースconfigクラス自身のデフォルトgetter値

`fallbackConfigs`は、開発専用のデフォルトでabstract configを満たしつつ、本番コードには具体的な`configs`エントリを明示的に渡すことを要求する用途でよく使われます:

```typescript
import { Config, createApp } from '@zeltjs/core';

@Config({ abstract: true })
abstract class PaymentGatewayConfig {
  abstract get apiKey(): string;
}

class DevPaymentGatewayConfig extends PaymentGatewayConfig {
  override get apiKey() {
    return 'sk_test_dev';
  }
}
// ---cut---
const app = createApp([]);
const readyApp = await app.createRuntime({
  fallbackConfigs: [DevPaymentGatewayConfig],
});
```

## Environment-Based Configuration {#environment-based-configuration}

`inject(Env)`は、adapterによって登録されたプラットフォーム固有のソースから環境変数を読み取ります。一般的なケースでは追加の設定は不要です。

### Node.js Environment {#nodejs-environment}

`onNode()`を使う場合、`ProcessEnvAdaptor`が自動的に登録されるため、`inject(Env)`は追加の設定なしに`process.env`から読み取ります:

```typescript
import { Config, Env, inject, createApp, Controller, Get, http } from '@zeltjs/core';

@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }
// ---cut---
@Config
export class DatabaseConfig {
  static readonly Token = DatabaseConfig;

  constructor(private env = inject(Env)) {}

  get host() {
    return this.env.getString('DATABASE_HOST', 'localhost');
  }

  get port() {
    return this.env.getNumber('DATABASE_PORT', 5432);
  }

  get connectionString() {
    return `postgres://${this.host}:${this.port}/mydb`;
  }
}

const app = createApp([http({
    controllers: [AppController],
  })], { configs: [DatabaseConfig] });
```

### Loading `.env` Files {#loading-env-files}

`.env`ファイルを読み込むには、アプリケーションのエントリポイントの最初に`dotenv/config`をimportします:

```typescript
// @errors: 2882
import 'dotenv/config';
import { onNode } from '@zeltjs/adapter-node';
// ...アプリのセットアップの続き
```

その後、`inject(Env)`はdotenvが`process.env`へ設定した変数を読み取ります。

### Cloudflare Workers Environment {#cloudflare-workers-environment}

Cloudflare Workersの場合、環境設定は`onCloudflareWorkers()`によって自動的に処理されます。詳細は[Cloudflare Workers Getting Startedガイド](./getting-started/cloudflare-workers)を参照してください。

## TypeScript Decorator Configuration {#typescript-decorator-configuration}

ZeltはTC39標準デコレータと、レガシーなTypeScriptデコレータの両方をサポートしています。フレームワークは実行時にどちらのモードが使われているかを自動で検出します。

### TC39 Standard Decorators (Recommended) {#tc39-standard-decorators-recommended}

新規プロジェクトではTC39標準デコレータを使ってください。特別なTypeScript設定は不要です:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext"
  }
}
```

### Legacy Decorators {#legacy-decorators}

既存のコードベースとの互換性のためには、レガシーデコレータを有効にします:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "experimentalDecorators": true
  }
}
```

### Detection Behavior {#detection-behavior}

Zeltは実行時のコンテキストに基づいてデコレータのモードを自動検出します:

- **TC39 mode**: デコレータは`kind`、`name`、`metadata`プロパティを持つcontextオブジェクトを受け取る
- **Legacy mode**: デコレータは`target`、`propertyKey`、`descriptor`引数を受け取る

どちらのモードもAPIの観点からは同一に動作します — モードを切り替える際にコードを変更する必要はありません。
