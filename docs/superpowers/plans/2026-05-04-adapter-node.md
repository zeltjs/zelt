# @koya/adapter-node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@koya/adapter-node` package to run `HttpApp` on Node.js HTTP server with a simple `serve(app)` API.

**Architecture:** Thin wrapper around `@hono/node-server`. The `serve` function accepts `HttpApp` and options, extracts `app.fetch`, and delegates to `honoServe`. Re-export `createAdaptorServer` for advanced use cases.

**Tech Stack:** TypeScript, @hono/node-server 2.0.1, vitest

**Spec:** `docs/superpowers/specs/2026-05-04-adapter-node-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/adapter-node/src/index.ts` | Public API: `serve`, `createAdaptorServer` re-export, types |
| `packages/adapter-node/src/index.test.ts` | Unit and integration tests |

---

## Task 1: Implement serve function with default options

**Files:**
- Modify: `packages/adapter-node/src/index.test.ts`
- Modify: `packages/adapter-node/src/index.ts`

### Step 1.1: Write failing test for serve with defaults

- [ ] Add test that `serve(app)` returns `http.Server` and listens on default port 3000

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

import { serve } from './index';

const createMockApp = () => ({
  fetch: async (req: Request) => new Response(`Hello from ${req.url}`),
  request: async () => new Response(''),
});

describe('serve', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it('returns http.Server and listens on default port 3000', async () => {
    const app = createMockApp();
    server = serve(app);

    expect(server).toBeDefined();
    expect(server.listening).toBe(true);

    const address = server.address();
    expect(address).not.toBeNull();
    expect(typeof address === 'object' && address?.port).toBe(3000);
  });
});
```

### Step 1.2: Run test to verify it fails

- [ ] Run: `pnpm --filter @koya/adapter-node test`
- [ ] Expected: FAIL - `serve` is not exported or doesn't exist

### Step 1.3: Implement serve function

- [ ] Replace `packages/adapter-node/src/index.ts` with:

```typescript
import { serve as honoServe, createAdaptorServer } from '@hono/node-server';
import type { Server } from 'node:http';

export { createAdaptorServer };

export type ServeOptions = {
  port?: number;
  hostname?: string;
};

export type AddressInfo = {
  port: number;
  address: string;
};

type AppLike = {
  fetch: (request: Request) => Promise<Response>;
};

export const serve = (
  app: AppLike,
  optionsOrCallback?: ServeOptions | ((info: AddressInfo) => void),
  maybeCallback?: (info: AddressInfo) => void
): Server => {
  const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback ?? {};
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;

  return honoServe(
    {
      fetch: app.fetch,
      port: options.port ?? 3000,
      hostname: options.hostname ?? '0.0.0.0',
    },
    callback
  );
};
```

### Step 1.4: Run test to verify it passes

- [ ] Run: `pnpm --filter @koya/adapter-node test`
- [ ] Expected: PASS

### Step 1.5: Commit

- [ ] Run:
```bash
git add packages/adapter-node/src/index.ts packages/adapter-node/src/index.test.ts
git commit -m "feat(adapter-node): implement serve function with default options"
```

---

## Task 2: Test serve with custom port option

**Files:**
- Modify: `packages/adapter-node/src/index.test.ts`

### Step 2.1: Write test for custom port

- [ ] Add test to the `describe('serve')` block:

```typescript
  it('listens on specified port', async () => {
    const app = createMockApp();
    server = serve(app, { port: 4567 });

    expect(server.listening).toBe(true);

    const address = server.address();
    expect(typeof address === 'object' && address?.port).toBe(4567);
  });
```

### Step 2.2: Run test to verify it passes

- [ ] Run: `pnpm --filter @koya/adapter-node test`
- [ ] Expected: PASS (implementation already supports this)

### Step 2.3: Commit

- [ ] Run:
```bash
git add packages/adapter-node/src/index.test.ts
git commit -m "test(adapter-node): verify serve with custom port option"
```

---

## Task 3: Test callback invocation

**Files:**
- Modify: `packages/adapter-node/src/index.test.ts`

### Step 3.1: Write test for callback with options

- [ ] Add test:

```typescript
  it('invokes callback with AddressInfo when options provided', async () => {
    const app = createMockApp();
    let receivedInfo: { port: number; address: string } | undefined;

    server = serve(app, { port: 5678 }, (info) => {
      receivedInfo = info;
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedInfo).toBeDefined();
    expect(receivedInfo?.port).toBe(5678);
    expect(typeof receivedInfo?.address).toBe('string');
  });
```

### Step 3.2: Write test for callback without options

- [ ] Add test:

```typescript
  it('invokes callback when passed as second argument', async () => {
    const app = createMockApp();
    let receivedInfo: { port: number; address: string } | undefined;

    server = serve(app, (info) => {
      receivedInfo = info;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedInfo).toBeDefined();
    expect(receivedInfo?.port).toBe(3000);
  });
```

### Step 3.3: Run tests to verify they pass

- [ ] Run: `pnpm --filter @koya/adapter-node test`
- [ ] Expected: PASS

### Step 3.4: Commit

- [ ] Run:
```bash
git add packages/adapter-node/src/index.test.ts
git commit -m "test(adapter-node): verify callback invocation patterns"
```

---

## Task 4: Integration test - HTTP request/response

**Files:**
- Modify: `packages/adapter-node/src/index.test.ts`

### Step 4.1: Write integration test

- [ ] Add test:

```typescript
  it('responds to HTTP requests', async () => {
    const app = createMockApp();
    server = serve(app, { port: 6789 });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await fetch('http://localhost:6789/hello');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe('Hello from http://localhost:6789/hello');
  });
```

### Step 4.2: Run test to verify it passes

- [ ] Run: `pnpm --filter @koya/adapter-node test`
- [ ] Expected: PASS

### Step 4.3: Commit

- [ ] Run:
```bash
git add packages/adapter-node/src/index.test.ts
git commit -m "test(adapter-node): add integration test for HTTP request/response"
```

---

## Task 5: Test createAdaptorServer re-export

**Files:**
- Modify: `packages/adapter-node/src/index.test.ts`

### Step 5.1: Write test for createAdaptorServer export

- [ ] Add new describe block:

```typescript
describe('createAdaptorServer', () => {
  it('is exported from the module', async () => {
    const { createAdaptorServer } = await import('./index');
    expect(createAdaptorServer).toBeDefined();
    expect(typeof createAdaptorServer).toBe('function');
  });
});
```

### Step 5.2: Run test to verify it passes

- [ ] Run: `pnpm --filter @koya/adapter-node test`
- [ ] Expected: PASS

### Step 5.3: Commit

- [ ] Run:
```bash
git add packages/adapter-node/src/index.test.ts
git commit -m "test(adapter-node): verify createAdaptorServer re-export"
```

---

## Task 6: Full test suite run and typecheck

**Files:**
- None (verification only)

### Step 6.1: Run full test suite

- [ ] Run: `pnpm --filter @koya/adapter-node test`
- [ ] Expected: All tests PASS

### Step 6.2: Run typecheck

- [ ] Run: `pnpm --filter @koya/adapter-node typecheck`
- [ ] Expected: No type errors

### Step 6.3: Run build

- [ ] Run: `pnpm --filter @koya/adapter-node build`
- [ ] Expected: Build succeeds, `dist/` contains output

---

## Task 7: Add example entry point

**Files:**
- Create: `examples/hello/src/entry/node.ts`
- Modify: `examples/hello/package.json`

### Step 7.1: Create node entry point

- [ ] Create `examples/hello/src/entry/node.ts`:

```typescript
import { serve } from '@koya/adapter-node';

import { app } from '../app';

serve(app, { port: 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

### Step 7.2: Add dependency and script to package.json

- [ ] Modify `examples/hello/package.json` to add `@koya/adapter-node` dependency and `start:node` script:

```json
{
  "scripts": {
    "start": "tsx src/main.ts",
    "start:node": "tsx src/entry/node.ts",
    "contract:build": "tsx ../../packages/contract/src/cli.ts build",
    "contract:watch": "tsx ../../packages/contract/src/cli.ts watch"
  },
  "dependencies": {
    "@koya/adapter-node": "workspace:*",
    "@koya/core": "workspace:*",
    "@koya/contract": "workspace:*",
    "hono": "4.12.16",
    "valibot": "1.3.1"
  }
}
```

### Step 7.3: Verify example works

- [ ] Run: `pnpm install`
- [ ] Run: `pnpm --filter @examples/hello start:node &`
- [ ] Run: `curl http://localhost:3000/echo` (or appropriate endpoint)
- [ ] Expected: Response from koya app
- [ ] Kill the server process

### Step 7.4: Commit

- [ ] Run:
```bash
git add examples/hello/src/entry/node.ts examples/hello/package.json pnpm-lock.yaml
git commit -m "feat(examples/hello): add Node.js server entry point"
```

---

## Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Implement serve with defaults | 1 |
| 2 | Custom port option | 1 |
| 3 | Callback invocation | 2 |
| 4 | Integration test | 1 |
| 5 | createAdaptorServer re-export | 1 |
| 6 | Full verification | - |
| 7 | Example entry point | - |

Total: 6 unit/integration tests
