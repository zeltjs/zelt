---
name: config-convention
description: Use when creating @Config classes for DI configuration. Required pattern for EnvAdaptor, LoggerConfig, JwtConfig, etc.
---

# @Config Convention

## Pattern

```typescript
import { Config } from '@zeltjs/core';

@Config
export class XxxConfig {
  get someValue(): string {
    return 'default';
  }

  get anotherValue(): number {
    return 100;
  }
}
```

## Rules

1. **Getters for defaults** - Use `get` not properties
2. **Users extend to customize** - Override getters in subclass

## Customization

```typescript
@Config
class MyEnvAdaptor extends EnvAdaptor {
  override get(key: string): string | undefined {
    // custom implementation
  }
}

// Usage
createApp({
  controllers,
  configs: [MyEnvAdaptor],
})
```

## Anti-patterns

| Bad | Good |
|-----|------|
| Factory function returning class | Extend base class |
| Constructor params for config | Override getters |
| `@injectable()` directly | Use `@Config` |
