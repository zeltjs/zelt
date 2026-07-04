---
---

# HTTP Security

Zelt provides built-in HTTP security through two auto-registered middleware classes: `SecureHeadersMiddleware` and `CorsMiddleware`. Both are registered globally on every HTTP app and run on all routes before your configured global middleware.

Configuration is controlled through `SecureHeadersConfig` and `CorsConfig`. Both use the `@Config` decorator pattern for type-safe, DI-based configuration.

- **SecureHeadersConfig** is enabled by default with secure defaults
- **CorsConfig** is disabled by default (empty origin) and must be explicitly configured

## SecureHeadersConfig

Security headers are automatically applied to all responses. The default configuration enables recommended security headers.

### Default Headers

| Header | Default |
|--------|---------|
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
| `X-Powered-By` | removed |
| `Cross-Origin-Embedder-Policy` | disabled |

### Customizing Headers

Extend `SecureHeadersConfig` and override properties to customize header values:

```typescript
import { Config, SecureHeadersConfig } from '@zeltjs/core';

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override readonly xFrameOptions = 'DENY';

  override readonly referrerPolicy = 'strict-origin-when-cross-origin';
}
```

### Disabling Headers

Set a header property to `false` to disable it:

```typescript
import { Config, SecureHeadersConfig } from '@zeltjs/core';

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override readonly xXssProtection = false;

  override readonly xDownloadOptions = false;
}
```

## CorsConfig

CORS is disabled by default. To enable it, extend `CorsConfig` and set the `origin` property.

### Enabling CORS

```typescript
import { Config, CorsConfig } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override readonly origin = 'https://example.com';
}
```

### Multiple Origins

```typescript
import { Config, CorsConfig } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override readonly origin = ['https://app.example.com', 'https://admin.example.com'];
}
```

### Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `string \| string[]` | `[]` | Allowed origins (empty disables CORS) |
| `credentials` | `boolean` | `false` | Allow credentials |
| `allowMethods` | `string[]` | `['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH']` | Allowed HTTP methods |
| `allowHeaders` | `string[]` | `[]` | Allowed request headers |
| `exposeHeaders` | `string[]` | `[]` | Headers exposed to the client |
| `maxAge` | `number \| undefined` | `undefined` | Preflight cache duration in seconds |

### Full Configuration Example

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

## Registration

The middleware classes are registered automatically. Register custom configs when creating the app:

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

The framework automatically detects and uses your custom configuration classes when registered in the `configs` array.

## Skipping Security Middleware

Use `@SkipMiddleware` to skip either built-in middleware for one endpoint or every endpoint in a controller. Method-level and controller-level skips are combined.

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

In this example, non-preflight requests to `WebhookController` endpoints skip CORS response headers. The `/webhook/raw` endpoint also skips secure headers.

`@SkipMiddleware(CorsMiddleware)` does not disable CORS preflight handling. `OPTIONS` preflight requests are handled by `CorsMiddleware` before an endpoint handler is selected, so the preflight response can still include CORS allow headers. The actual endpoint response is the part that skips `CorsMiddleware`.
