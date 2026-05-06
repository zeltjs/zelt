---
name: config-convention
description: Use when creating @Config classes for DI configuration. Required pattern for EnvConfig, LoggerConfig, JwtConfig, etc.
---

# @Config Convention

## Pattern

```typescript
import { Config } from '@zeltjs/core';

@Config
export class XxxConfig {
  static readonly Token = XxxConfig;

  get someValue(): string {
    return 'default';
  }

  get anotherValue(): number {
    return 100;
  }
}
```

## Rules

1. **`static readonly Token = ClassName`** - Self-referencing token for DI
2. **Getters for defaults** - Use `get` not properties
3. **Users extend to customize** - Override getters in subclass

## Customization

```typescript
@Config
class MyEnvConfig extends EnvConfig {
  constructor() {
    super();
    // initialization logic (e.g., dotenv loading)
  }

  override get(key: string): string | undefined {
    // custom implementation
  }
}

// Usage
createApp({
  controllers,
  configs: [MyEnvConfig],
})
```

## Anti-patterns

| Bad | Good |
|-----|------|
| Factory function returning class | Extend base class |
| Constructor params for config | Override getters |
| `@injectable()` directly | Use `@Config` |
| Missing static Token | Always include Token |
