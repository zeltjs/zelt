---
---

# HTTP Security

Zelt provides built-in HTTP security through two configuration classes: `SecureHeadersConfig` and `CorsConfig`. Both use the `@Config` decorator pattern for type-safe, DI-based configuration.

- **SecureHeadersConfig** is enabled by default with secure defaults
- **CorsConfig** is disabled by default (empty origin) and must be explicitly configured

## SecureHeadersConfig

Security headers are automatically applied to all responses. The default configuration enables recommended security headers.

### Default Headers

| Header | Default |
|--------|---------|
| `Cross-Origin-Resource-Policy` | enabled |
| `Cross-Origin-Opener-Policy` | enabled |
| `Origin-Agent-Cluster` | enabled |
| `Referrer-Policy` | enabled |
| `Strict-Transport-Security` | enabled |
| `X-Content-Type-Options` | enabled |
| `X-DNS-Prefetch-Control` | enabled |
| `X-Download-Options` | enabled |
| `X-Frame-Options` | enabled |
| `X-Permitted-Cross-Domain-Policies` | enabled |
| `X-XSS-Protection` | enabled |
| `X-Powered-By` | removed |
| `Cross-Origin-Embedder-Policy` | disabled |

### Customizing Headers

Extend `SecureHeadersConfig` and override getters to customize header values:

```typescript
import { Config, SecureHeadersConfig } from '@zeltjs/core';

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override get xFrameOptions() {
    return 'DENY';
  }

  override get referrerPolicy() {
    return 'strict-origin-when-cross-origin';
  }
}
```

### Disabling Headers

Set a header getter to `false` to disable it:

```typescript
import { Config, SecureHeadersConfig } from '@zeltjs/core';

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override get xXssProtection() {
    return false;
  }

  override get xDownloadOptions() {
    return false;
  }
}
```

## CorsConfig

CORS is disabled by default. To enable it, extend `CorsConfig` and set the `origin` getter.

### Enabling CORS

```typescript
import { Config, CorsConfig } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override get origin() {
    return 'https://example.com';
  }
}
```

### Multiple Origins

```typescript
import { Config, CorsConfig } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override get origin() {
    return ['https://app.example.com', 'https://admin.example.com'];
  }
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
  override get origin() {
    return 'https://example.com';
  }

  override get credentials() {
    return true;
  }

  override get allowHeaders() {
    return ['Content-Type', 'Authorization'];
  }

  override get exposeHeaders() {
    return ['X-Request-Id'];
  }

  override get maxAge() {
    return 86400;
  }
}
```

## Registration

Register custom configs when creating the app:

```typescript
import { createApp, Config, CorsConfig, SecureHeadersConfig, Controller, Get } from '@zeltjs/core';

@Config
class MyCorsConfig extends CorsConfig {
  override get origin() { return 'https://example.com'; }
  override get credentials() { return true; }
}

@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override get xFrameOptions() { return 'DENY'; }
}

@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }

const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [MyCorsConfig, MySecureHeadersConfig],
});
```

The framework automatically detects and uses your custom configuration classes when registered in the `configs` array.
