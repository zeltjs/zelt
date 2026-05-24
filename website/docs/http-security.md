---
---

# HTTP Security

Zelt includes built-in support for CORS and security headers via `CorsConfig` and `SecureHeadersConfig`. These wrap Hono's middleware with Zelt's DI-based configuration pattern.

## Security Headers

Security headers are **enabled by default** with secure defaults. Every HTTP response includes headers like `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.

### Default Behavior

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';

@Controller('/api')
class ApiController {
  @Get('/data')
  getData() {
    return { value: 42 };
  }
}

const app = createApp({
  http: { controllers: [ApiController] },
});
```

Response headers automatically include:

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: no-referrer
X-XSS-Protection: 0
Strict-Transport-Security: max-age=15552000; includeSubDomains
```

### Customizing Security Headers

Extend `SecureHeadersConfig` to customize:

```typescript
import { Config, SecureHeadersConfig, createApp, Controller, Get } from '@zeltjs/core';

@Controller('/api')
class ApiController {
  @Get('/') get() { return {}; }
}
// ---cut---
@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override get xFrameOptions() {
    return 'DENY';
  }

  override get referrerPolicy() {
    return 'strict-origin-when-cross-origin';
  }
}

const app = createApp({
  http: { controllers: [ApiController] },
  configs: [MySecureHeadersConfig],
});
```

### Disabling Specific Headers

Return `false` to disable a header:

```typescript
import { Config, SecureHeadersConfig } from '@zeltjs/core';
// ---cut---
@Config
class MySecureHeadersConfig extends SecureHeadersConfig {
  override get xXssProtection() {
    return false;
  }
}
```

### Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `crossOriginEmbedderPolicy` | `boolean \| string` | `false` | Cross-Origin-Embedder-Policy |
| `crossOriginResourcePolicy` | `boolean \| string` | `true` | Cross-Origin-Resource-Policy |
| `crossOriginOpenerPolicy` | `boolean \| string` | `true` | Cross-Origin-Opener-Policy |
| `originAgentCluster` | `boolean \| string` | `true` | Origin-Agent-Cluster |
| `referrerPolicy` | `boolean \| string` | `true` | Referrer-Policy |
| `strictTransportSecurity` | `boolean \| string` | `true` | Strict-Transport-Security |
| `xContentTypeOptions` | `boolean \| string` | `true` | X-Content-Type-Options |
| `xDnsPrefetchControl` | `boolean \| string` | `true` | X-DNS-Prefetch-Control |
| `xDownloadOptions` | `boolean \| string` | `true` | X-Download-Options |
| `xFrameOptions` | `boolean \| string` | `true` | X-Frame-Options |
| `xPermittedCrossDomainPolicies` | `boolean \| string` | `true` | X-Permitted-Cross-Domain-Policies |
| `xXssProtection` | `boolean \| string` | `true` | X-XSS-Protection |
| `removePoweredBy` | `boolean` | `true` | Remove X-Powered-By header |

When `true`, Hono's secure defaults are used. Pass a string to set a custom value.

## CORS

CORS is **disabled by default** (no origins allowed). Configure `CorsConfig` to enable it.

### Enabling CORS

```typescript
import { Config, CorsConfig, createApp, Controller, Get } from '@zeltjs/core';

@Controller('/api')
class ApiController {
  @Get('/') get() { return {}; }
}
// ---cut---
@Config
class MyCorsConfig extends CorsConfig {
  override get origin() {
    return 'https://example.com';
  }
}

const app = createApp({
  http: { controllers: [ApiController] },
  configs: [MyCorsConfig],
});
```

### Multiple Origins

```typescript
import { Config, CorsConfig } from '@zeltjs/core';
// ---cut---
@Config
class MyCorsConfig extends CorsConfig {
  override get origin() {
    return ['https://example.com', 'https://app.example.com'];
  }
}
```

### With Credentials

```typescript
import { Config, CorsConfig } from '@zeltjs/core';
// ---cut---
@Config
class MyCorsConfig extends CorsConfig {
  override get origin() {
    return 'https://example.com';
  }

  override get credentials() {
    return true;
  }
}
```

### Full Configuration

```typescript
import { Config, CorsConfig } from '@zeltjs/core';
// ---cut---
@Config
class MyCorsConfig extends CorsConfig {
  override get origin() {
    return 'https://example.com';
  }

  override get allowMethods() {
    return ['GET', 'POST', 'PUT', 'DELETE'];
  }

  override get allowHeaders() {
    return ['Content-Type', 'Authorization'];
  }

  override get exposeHeaders() {
    return ['X-Custom-Header'];
  }

  override get maxAge() {
    return 86400; // 24 hours
  }

  override get credentials() {
    return true;
  }
}
```

### Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `string \| string[]` | `[]` | Allowed origins. Empty array disables CORS |
| `allowMethods` | `string[]` | `['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH']` | Allowed HTTP methods |
| `allowHeaders` | `string[]` | `[]` | Allowed request headers |
| `exposeHeaders` | `string[]` | `[]` | Headers exposed to the browser |
| `maxAge` | `number \| undefined` | `undefined` | Preflight cache duration in seconds |
| `credentials` | `boolean` | `false` | Allow credentials (cookies, auth headers) |

## Environment-Based Configuration

Use `EnvConfig` to configure based on environment:

```typescript
import { Config, CorsConfig, EnvConfig, inject } from '@zeltjs/core';
// ---cut---
@Config
class MyCorsConfig extends CorsConfig {
  constructor(private env = inject(EnvConfig)) {
    super();
  }

  override get origin() {
    const origins = this.env.get('CORS_ORIGINS');
    return origins ? origins.split(',') : [];
  }

  override get credentials() {
    return this.env.get('CORS_CREDENTIALS') === 'true';
  }
}
```
