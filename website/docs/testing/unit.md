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
// @noErrors
// Reason: import-only example for test framework setup
import { onTest, createTestTarget } from '@zeltjs/testing/vitest';
```

### Jest

```typescript
// @noErrors
// Reason: import-only example for test framework setup
import { onTest, createTestTarget } from '@zeltjs/testing/jest';
```

### Bun

```typescript
// @noErrors
// Reason: import-only example for test framework setup
import { onTest, createTestTarget } from '@zeltjs/testing/bun';
```

### Node.js Test Runner

```typescript
// @noErrors
// Reason: import-only example for test framework setup
import { onTest, createTestTarget } from '@zeltjs/testing/node';
```

### Manual Setup

If you prefer manual control or use a different test runner, import from the base package and call `shutdownAll()` yourself:

```typescript
// @noErrors
// Reason: import-only example for test framework setup
import { onTest, createTestTarget, shutdownAll } from '@zeltjs/testing';
import { afterAll } from 'your-test-runner';

afterAll(shutdownAll);
```

## createTestTarget

`createTestTarget` is the primary testing utility for instantiating services with dependency injection. It automatically handles lifecycle management and cleanup.

```typescript
import { describe, it, expect } from 'vitest';
import { createTestTarget } from '@zeltjs/testing';
import { Injectable } from '@zeltjs/core';

@Injectable()
class UserService {
  async create(data: { name: string }) { return data; }
}
// ---cut---
describe('UserService', () => {
  it('should create user', async () => {
    const { target } = await createTestTarget(UserService);

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
import { describe, it, expect, vi } from 'vitest';
import { createTestTarget } from '@zeltjs/testing';
import { Injectable, inject } from '@zeltjs/core';

@Injectable()
class EmailService {
  async send(to: string, subject: string) { return { to, subject }; }
}

@Injectable()
class UserService {
  constructor(private emailService = inject(EmailService)) {}
  async register(data: { email: string }) {
    await this.emailService.send(data.email, 'Welcome!');
  }
}
// ---cut---
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

## Testing Commands

When testing CLI commands, you need to create a fresh app instance for each test. App instances cannot be reused after `createRuntime()` is called.

### The Problem

Reusing a global app instance causes errors:

```typescript
import { describe, it, expect } from 'vitest';
import { createApp, Command, cliSchema, ZeltLifecycleStateError, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() { console.log('Hello!'); }
}

const app = createApp([command([GreetCommand])]);
// ---cut---
describe('GreetCommand', () => {
  it('test 1', async () => {
    const nodeApp = await onNode(app);
    await nodeApp.commands.execCommand(['greet']);
    // works
  });

  it('test 2 — reusing the same app instance throws', async () => {
    // ❌ Cannot call onNode() on an already-ready app
    await expect(onNode(app)).rejects.toThrow(ZeltLifecycleStateError);
  });
});
```

Once `onNode()` is called, the app transitions to `ready` state. Calling `onNode()` again on the same instance fails because lifecycle hooks cannot be re-registered.

### The Solution

Create a new app instance for each test:

```typescript
import { describe, it, afterEach } from 'vitest';
import { createApp, Command, cliSchema, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() { console.log('Hello!'); }
}
// ---cut---
describe('GreetCommand', () => {
  let nodeApp:
    | {
        shutdown(): Promise<void>;
        commands: { execCommand(argv: readonly string[]): Promise<{ exitCode: number }> };
      }
    | undefined;

  afterEach(async () => {
    await nodeApp?.shutdown();
  });

  it('test 1', async () => {
    const app = createApp([command([GreetCommand])]);
    nodeApp = await onNode(app);
    await nodeApp.commands.execCommand(['greet']);
    // works
  });

  it('test 2', async () => {
    const app = createApp([command([GreetCommand])]);
    nodeApp = await onNode(app);
    await nodeApp.commands.execCommand(['greet']);
    // works — fresh app instance
  });
});
```

### Using a Factory Function

For cleaner tests, extract app creation into a factory:

```typescript
import { describe, it, afterEach } from 'vitest';
import { createApp, Command, cliSchema, command } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() { console.log('Hello!'); }
}
// ---cut---
function createTestApp() {
  return createApp([command([GreetCommand])]);
}

describe('GreetCommand', () => {
  let nodeApp:
    | {
        shutdown(): Promise<void>;
        commands: { execCommand(argv: readonly string[]): Promise<{ exitCode: number }> };
      }
    | undefined;

  afterEach(async () => {
    await nodeApp?.shutdown();
  });

  it('executes successfully', async () => {
    nodeApp = await onNode(createTestApp());
    const result = await nodeApp.commands.execCommand(['greet']);
    // assert result
  });
});
```
