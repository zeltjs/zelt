---
---

# Unit Testing

Zelt provides `@zeltjs/testing` package with utilities for unit testing your services with dependency injection support.

## Installation

```bash
pnpm add -D @zeltjs/testing
```

## Test Runner Adapters

Import from the adapter for your test runner. This auto-registers cleanup via `afterAll`.

### Vitest

```typescript
import { onTest, createTestTarget } from '@zeltjs/testing/vitest';
```

### Jest

```typescript
import { onTest, createTestTarget } from '@zeltjs/testing/jest';
```

### Bun

```typescript
import { onTest, createTestTarget } from '@zeltjs/testing/bun';
```

### Node.js Test Runner

```typescript
import { onTest, createTestTarget } from '@zeltjs/testing/node';
```

### Manual Setup

If you prefer manual control or use a different test runner, import from the base package and call `shutdownAll()` yourself:

```typescript
import { onTest, createTestTarget, shutdownAll } from '@zeltjs/testing';
import { afterAll } from 'your-test-runner';

afterAll(shutdownAll);
```

## createTestTarget

`createTestTarget` is the primary testing utility for instantiating services with dependency injection. It automatically handles lifecycle management and cleanup.

```typescript
import { describe, it, expect } from 'vitest';
import { createTestTarget } from '@zeltjs/testing/vitest';
import { UserService } from './user.service';
import { ProcessEnvConfig } from '@zeltjs/core';

describe('UserService', () => {
  it('should create user', async () => {
    const { target, shutdown } = await createTestTarget(UserService, {
      configs: [ProcessEnvConfig],
    });

    const user = await target.create({ name: 'Alice' });
    expect(user.name).toBe('Alice');
  });
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `configs` | `Class[]` | Configuration classes to register |
| `overrides` | `Override[]` | Mock implementations for dependencies |

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `target` | `T` | The instantiated service |
| `get` | `(cls) => T` | Resolve additional dependencies from the container |
| `shutdown` | `() => Promise<void>` | Cleanup function (auto-registered to `shutdownAll`) |

## Mocking Dependencies

Use `overrides` to replace real implementations with mocks (Solitary Unit Test):

```typescript
import { createTestTarget } from '@zeltjs/testing/vitest';
import { UserService } from './user.service';
import { EmailService } from './email.service';

describe('UserService', () => {
  it('should send welcome email', async () => {
    const mockEmailService = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const { target } = await createTestTarget(UserService, {
      overrides: [
        { provide: EmailService, useValue: mockEmailService },
      ],
    });

    await target.register({ email: 'alice@example.com' });
    expect(mockEmailService.send).toHaveBeenCalledWith(
      'alice@example.com',
      expect.stringContaining('Welcome')
    );
  });
});
```

## Lifecycle Management

`createTestTarget` automatically registers shutdown functions to `shutdownAll`:

1. **Startup**: All registered `Lifecycle` implementations are started when the test target is created
2. **Shutdown**: Call `shutdownAll()` in your test runner's global teardown (handled automatically by adapter imports)

This ensures resources are properly cleaned up even if tests fail.
