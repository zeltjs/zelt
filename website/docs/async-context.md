---
---

# Execution Context

Zelt can run without `AsyncLocalStorage` (ALS). Request accessors and middleware values use the same APIs in both context modes.

| Operation inside an HTTP entry | `sync` | `async` |
|---|---|---|
| Read `request()`, `response()`, or `middlewareValue(M)` in parameter defaults | Yes | Yes |
| Use the captured accessor or value after `await` | Yes | Yes |
| Call `next(value)` after `await` | Yes | Yes |
| Call an ambient context helper directly after `await` | Throws | Yes |

In `sync` mode, ambient helpers are available only during the synchronous part of a framework invocation. A timer or `.then()` callback is outside that interval too. Each downstream middleware and handler receives a fresh invocation boundary, even when its upstream middleware awaited before calling `next`.

## Choose a mode

Core starts in `sync` mode, without importing any Node built-ins. To opt into asynchronous propagation, enable the separate entry before creating a runtime:

```typescript
import { createApp, http } from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

enableAsyncContext();

const app = createApp([http({ controllers: [] })]);
const runtime = await app.createRuntime({ contextMode: 'async' });
```

`enableAsyncContext()` is idempotent and makes newly created runtimes default to `async`. Existing runtimes retain their selected mode. A runtime can explicitly select `contextMode: 'sync'` even when ALS is enabled; its context does not become ambient after suspension.

Node, Bun, Lambda, and Electron adapters enable ALS and default to `async`. Their `contextMode` option can explicitly select `sync`. The Cloudflare Workers adapter does not import ALS and can run without `nodejs_compat` or `nodejs_als` for Zelt's core context handling. Other application dependencies may still require those flags.

Requesting `async` without first enabling ALS throws during runtime creation. There is no automatic retry in synchronous mode.

## Portable handler signatures

Capture framework inputs at the invocation boundary:

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/users')
class UsersController {
  @Get('/:id')
  async find(req = request(), res = response()) {
    await Promise.resolve();
    return res.json({ id: req.pathParam('id') });
  }
}
```

Use `value = middlewareValue(MyMiddleware)` and `opts = middlewareOptions(MyMiddleware)` the same way. Captured request accessors retain their body cache, path parameters, and Hono context. Middleware instances remain shared singletons; each invocation's arguments and `next` retain its own request state. A saved `next` cannot be used after that middleware's `use()` has completed.

If an operation needs to read or update context later, capture an explicit execution handle before suspension:

```typescript
import { captureContext, Controller, Get, request } from '@zeltjs/core';

@Controller('/example')
class ExampleController {
  @Get('/')
  async handle(req = request()) {
    const context = captureContext();
    await Promise.resolve();
    return context.run(() => ({ path: request().path(), method: req.method() }));
  }
}
```

In `sync` mode, `context.run(async () => ...)` restores ambient access only until that callback first suspends. Capture its inputs before awaiting as usual. `setUser`, session mutation functions, and platform-binding reads follow this same rule.

## Other context-dependent features

- Logging: `logger.child(bindings)` retains its bindings across awaits in both modes. `withLogContext` only propagates implicitly across awaits in `async` mode.
- Tasks: `run()` and `runAndWait()` work in both modes. In `sync` mode, `shutdown()` rejects with `TaskRunnerSynchronousShutdownError` while tasks are active, because an external caller cannot be distinguished from a task waiting on itself. Await `runAndWait()` before shutdown, or enable asynchronous context for task draining.
- `afterResponse()` tasks run in the completed request's flush scope. Temporary storage scopes from registration, including database transactions and log bindings, are not retained. Capture any data or child logger your task needs before returning from the handler.
- Database: automatic transaction propagation requires `async` mode. This change does not redesign database transactions.
- CLI and GraphQL: capture `args(...)` in method parameter defaults. Resolver invocation restores its execution context after asynchronous resolver lookup.

For portable tests, pass `{ contextMode: 'sync' }` to `onTest`. Tests that need ambient access after awaits can call `enableAsyncContext()` in their setup.
