# Env API Simplification Design

## Summary

Simplify the environment variable API by consolidating `EnvConfig` and `EnvService` into a single `Env` class, removing `DotEnvConfig`, and making `.env` file loading the user's responsibility.

## Problem

Current state has 4 classes with unclear roles:

| Class | Package | Role |
|-------|---------|------|
| EnvConfig | core | Abstract base, `get()` only |
| EnvService | core | Wrapper with `getString/getNumber/getBoolean` |
| ProcessEnvConfig | adapter-node | Reads from `process.env` |
| DotEnvConfig | adapter-node | Reads `.env` then `process.env` |

User confusion:
- Which to inject? `EnvConfig`? `EnvService`? `DotEnvConfig`?
- What to register in `configs`?
- How to specify custom `.env` paths?

## Design

### User-Facing API

Single `Env` class with utility methods:

```typescript
import { Config, Env, inject } from '@zeltjs/core';

@Config
class AppConfig {
  constructor(private env = inject(Env)) {}
  
  get port() { return this.env.getNumber('PORT', 3000); }
  get apiKey() { return this.env.getRequired('API_KEY'); }
  get debug() { return this.env.getBoolean('DEBUG', false); }
}

@Config
class DatabaseConfig {
  constructor(private env = inject(Env)) {}
  
  get host() { return this.env.getString('DB_HOST', 'localhost'); }
  get port() { return this.env.getNumber('DB_PORT', 5432); }
}
```

### Env Class Methods

```typescript
class Env {
  getString(key: string, defaultValue?: string): string;
  getNumber(key: string, defaultValue?: number): number;
  getBoolean(key: string, defaultValue?: boolean): boolean;
  getRequired(key: string): string;  // throws if missing
}
```

### Internal Implementation

```
Env (core)
  └── uses EnvAdaptor (internal, not exposed)
        ↑ ProcessEnvAdaptor (adapter-node) - reads process.env
        ↑ CloudflareEnvSource (adapter-cloudflare) - reads c.env
```

- `EnvAdaptor` is an internal abstraction, not exposed to users
- `onNode()` registers `ProcessEnvAdaptor` automatically
- `onCloudflareWorkers()` registers `CloudflareEnvSource` automatically

### .env File Loading

User responsibility, not framework's:

```typescript
// main.ts (Node.js entry point)
import 'dotenv/config';  // standard dotenv usage

const app = createApp({
  http: { controllers: [AppController] },
  configs: [AppConfig, DatabaseConfig],
});

await onNode(app);
```

For custom paths:
```typescript
import { config } from 'dotenv';
config({ path: ['.env', '.env.local', '.env.staging'] });
```

### Platform Separation

```
Entry points (platform-dependent):
├── main.ts (Node.js)
│   import 'dotenv/config'
│   await onNode(app)
│
└── worker.ts (Cloudflare Workers)
    export default onCloudflareWorkers(app)

Business logic (platform-independent):
├── app.config.ts     → inject(Env)
├── database.config.ts → inject(Env)
└── ...
```

## Migration

### Breaking Changes

| Before | After | Action |
|--------|-------|--------|
| `inject(EnvConfig)` | `inject(Env)` | Rename |
| `inject(EnvService)` | `inject(Env)` | Rename |
| `inject(ProcessEnvConfig)` | `inject(Env)` | Rename |
| `inject(DotEnvConfig)` | `inject(Env)` + `import 'dotenv/config'` | Change pattern |
| `configs: [DotEnvConfig]` | Remove, add `import 'dotenv/config'` to entry | Change pattern |
| `extends DotEnvConfig` with custom paths | Use `dotenv.config({ path: [...] })` | Change pattern |

### Deprecation Strategy

1. Add `Env` class with new API
2. Mark `EnvConfig`, `EnvService`, `ProcessEnvConfig`, `DotEnvConfig` as `@deprecated`
3. Remove deprecated classes in next major version

## Removed Concepts

| Removed | Reason |
|---------|--------|
| `EnvConfig` | Merged into `Env` |
| `EnvService` | Merged into `Env` |
| `ProcessEnvConfig` | Internal implementation (`ProcessEnvAdaptor`) |
| `DotEnvConfig` | User uses `dotenv` directly |

## Benefits

1. **Single injection target**: `inject(Env)` only
2. **No framework coupling for .env**: Standard `dotenv` usage
3. **Fewer concepts**: 4 classes → 1 class
4. **Clear separation**: Entry point (platform-dependent) vs business logic (platform-independent)
5. **Custom .env paths**: Use `dotenv` API directly, no framework workaround needed

## Related

- Issue: #e086d2a0
- User feedback: 2026-05-21
