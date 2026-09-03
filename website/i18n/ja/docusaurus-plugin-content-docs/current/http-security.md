---
---

# HTTPセキュリティ

Zeltは、2つの自動登録されるmiddlewareクラス `SecureHeadersMiddleware` と `CorsMiddleware` を通じて、組み込みのHTTPセキュリティを提供します。どちらもすべてのHTTPアプリにグローバルに登録され、あなたが設定したグローバルmiddlewareより先に、すべてのrouteで実行されます。

設定は `SecureHeadersConfig` と `CorsConfig` を通じて制御します。どちらも型安全でDIベースの設定のための `@Config` デコレータパターンを使用します。

- **SecureHeadersConfig** は、安全なデフォルト値でデフォルトで有効になっています
- **CorsConfig** はデフォルトで無効(空のorigin)で、明示的に設定する必要があります

## SecureHeadersConfig {#secureheadersconfig}

セキュリティヘッダーはすべてのレスポンスに自動的に適用されます。デフォルト設定では推奨されるセキュリティヘッダーが有効になります。

### デフォルトヘッダー {#default-headers}

| ヘッダー | デフォルト |
|--------|--------|
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Origin-Agent-Cluster` | `?1` |
| `Referrer-Policy` | `no-referrer` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Download-Options` | `noopen` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `X-XSS-Protection` | `0` |
| `X-Powered-By` | 削除される |
| `Cross-Origin-Embedder-Policy` | 無効 |

### ヘッダーのカスタマイズ {#customizing-headers}

`SecureHeadersConfig` を継承し、プロパティをoverrideしてヘッダー値をカスタマイズします:

```typescript
import { Config, SecureHeadersConfig } from '@zeltjs/core';

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override readonly xFrameOptions = 'DENY';

  override readonly referrerPolicy = 'strict-origin-when-cross-origin';
}
```

### ヘッダーの無効化 {#disabling-headers}

ヘッダープロパティを `false` に設定すると無効になります:

```typescript
import { Config, SecureHeadersConfig } from '@zeltjs/core';

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override readonly xXssProtection = false;

  override readonly xDownloadOptions = false;
}
```

## CorsConfig {#corsconfig}

CORSはデフォルトで無効です。有効にするには、`CorsConfig` を継承して `origin` プロパティを設定します。

### CORSの有効化 {#enabling-cors}

```typescript
import { Config, CorsConfig } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override readonly origin = 'https://example.com';
}
```

### 複数のOrigin {#multiple-origins}

```typescript
import { Config, CorsConfig } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override readonly origin = ['https://app.example.com', 'https://admin.example.com'];
}
```

### 利用可能なオプション {#available-options}

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `origin` | `string \| string[]` | `[]` | 許可するorigin(空の場合CORSは無効) |
| `credentials` | `boolean` | `false` | credentialを許可する |
| `allowMethods` | `string[]` | `['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH']` | 許可するHTTPメソッド |
| `allowHeaders` | `string[]` | `[]` | 許可するrequestヘッダー |
| `exposeHeaders` | `string[]` | `[]` | clientに公開するヘッダー |
| `maxAge` | `number \| undefined` | `undefined` | preflightキャッシュの秒数 |

### 設定の全体例 {#full-configuration-example}

```typescript
import { Config, CorsConfig } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override readonly origin = 'https://example.com';

  override readonly credentials = true;

  override readonly allowHeaders = ['Content-Type', 'Authorization'];

  override readonly exposeHeaders = ['X-Request-Id'];

  override readonly maxAge = 86400;
}
```

## 登録 {#registration}

middlewareクラスは自動的に登録されます。アプリ作成時にカスタムconfigを登録します:

```typescript
import { createApp, Config, CorsConfig, SecureHeadersConfig, Controller, Get, http } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override readonly origin = 'https://example.com';
  override readonly credentials = true;
}

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override readonly xFrameOptions = 'DENY';
}

@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }

const app = createApp([http({
    controllers: [AppController],
  })], { configs: [MyCorsConfig, MySecureHeadersConfig] });
```

frameworkは、`configs` 配列に登録されたカスタム設定クラスを自動的に検出して使用します。

## セキュリティmiddlewareのスキップ {#skipping-security-middleware}

`@SkipMiddleware` を使うと、1つのendpointまたはcontroller内のすべてのendpointについて、いずれかの組み込みmiddlewareをスキップできます。メソッドレベルとcontrollerレベルのスキップは組み合わされます。

```typescript
import {
  Controller,
  CorsMiddleware,
  Get,
  SecureHeadersMiddleware,
  SkipMiddleware,
} from '@zeltjs/core';

@SkipMiddleware(CorsMiddleware)
@Controller('/webhook')
class WebhookController {
  @Get('/health')
  health() {
    return { ok: true };
  }

  @SkipMiddleware(SecureHeadersMiddleware)
  @Get('/raw')
  raw() {
    return { ok: true };
  }
}
```

この例では、`WebhookController` のendpointへのnon-preflightリクエストはCORSレスポンスヘッダーをスキップします。`/webhook/raw` endpointはセキュリティヘッダーもスキップします。

`@SkipMiddleware(CorsMiddleware)` はCORS preflightの処理を無効にしません。`OPTIONS` preflightリクエストは、endpoint handlerが選択される前に `CorsMiddleware` によって処理されるため、preflightレスポンスにはCORS allowヘッダーが引き続き含まれる場合があります。`CorsMiddleware` をスキップするのは、実際のendpointレスポンスの部分です。
