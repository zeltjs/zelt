# @zeltjs/adapter-txiki

Run Zelt applications on the official [txiki.js](https://txikijs.org/) runtime, without Node.js or AsyncLocalStorage at runtime. Development and TypeScript builds can continue to use Node.

```sh
npm install @zeltjs/core @zeltjs/adapter-txiki
```

```ts
import { Controller, createApp, Get, http } from '@zeltjs/core';
import { onTxiki } from '@zeltjs/adapter-txiki';

@Controller('/api')
class ApiController {
  @Get('/status')
  status() { return { status: 'ok' }; }
}

const app = await onTxiki(createApp([http({ controllers: [ApiController] })]));
const server = app.http.serve({ port: 3000, hostname: '127.0.0.1' });
console.log(server.address);
```

Bundle the application and its npm dependencies into ESM, transform decorators, and run the result with `tjs run dist/main.js`. The [runnable example](../../examples/txiki-http) includes the build configuration.

Each named `http()` feature gets a separate `.serve()`, while services remain shared. Port `0` selects a free port; `server.address.port` reports the actual port. The default address is `127.0.0.1:3000`.

`onTxiki` uses `contextMode: 'sync'`. Capture request helpers in method default parameters or before the first `await`:

```ts
async handle(req = request(), res = response()) {
  const body = await req.body();
  return res.json(body);
}
```

For ambient helpers needed later, capture `const context = captureContext()` at entry and use `context.run(() => currentUser())`. Importing `@zeltjs/core/async-context` is unnecessary and incompatible with this runtime.

`TxikiEnvAdaptor` supplies environment variables through the usual `inject(Env)` API. Options include `configs`, `prebuilt`, `warmup` (default `true`), and `signals` (default `true`). SIGINT/SIGTERM close all registered servers and framework resources. `app.shutdown()` and each server's `shutdown()` can be called repeatedly; concurrent app shutdown callers wait for the same operation.

## Request compatibility

txiki.js 26.6.0's `Request.clone()` mishandles buffered bodies. The adapter buffers incoming request bodies and creates independent clones at its HTTP boundary; it does not patch global Web APIs. This applies to `.fetch()`, `.request()` and `.serve()`. The raw underlying Hono router remains a lower-level API.

Request uploads are buffered in memory, so an upload must have a finite body. TCP response streaming remains available through txiki.js. `prepareTxikiRequest()` is exported for integrations that need the same request preparation.

Tested on Linux with official txiki.js 26.6.0.
