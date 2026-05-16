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
import { ConfigClass } from '@zeltjs/core';
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; };
declare function createTestTarget<T extends object>(cls: new (...args: never[]) => T, opts?: { configs?: readonly ConfigClass<object>[] }): Promise<{ target: T; shutdown: () => Promise<void> }>;
declare class UserService { create(data: { name: string }): Promise<{ name: string }>; }
declare const ProcessEnvConfig: ConfigClass<object>;
// ---cut---
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
import { ConfigClass } from '@zeltjs/core';
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
interface ExpectStatic { <T>(value: T): { toBe(expected: T): void; toHaveBeenCalledWith(...args: unknown[]): void }; stringContaining(str: string): unknown; }
declare const expect: ExpectStatic;
declare const vi: { fn: () => { mockResolvedValue: (val: unknown) => { send: unknown } } };
type Override<T> = { provide: new (...args: never[]) => T; useValue: unknown };
declare function createTestTarget<T extends object>(cls: new (...args: never[]) => T, opts?: { configs?: readonly ConfigClass<object>[]; overrides?: Override<unknown>[] }): Promise<{ target: T }>;
declare class UserService { register(data: { email: string }): Promise<void>; }
declare class EmailService { send(to: string, subject: string): Promise<void>; }
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
