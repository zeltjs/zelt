---
title: txiki.js
---

Run your Zelt backend on [txiki.js](https://txikijs.org/) with `@zeltjs/adapter-txiki`. Node can remain your development/build tool; it is not a dependency of the running app.

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
app.http.serve({ port: 3000 });
```

Bundle your TypeScript and npm dependencies into ESM and transform decorators, then run `tjs run dist/main.js`. See the [complete build example](https://github.com/zeltjs/zelt/tree/main/examples/txiki-http).

Each named HTTP feature has its own `.serve()`. DI services are shared. `TxikiEnvAdaptor` supplies environment variables through `inject(Env)`. SIGINT/SIGTERM close servers and resources; call `app.shutdown()` to stop programmatically.

## Context mode

The adapter explicitly uses synchronous context. Capture `request()`, `response()` and middleware values in method default parameters or before the first `await`. Their captured references remain usable afterward. Use `captureContext().run(...)` when a later callback needs ambient helpers. See [Async Context](../async-context).

## Request bodies

For txiki.js 26.6.0 compatibility, the adapter buffers incoming request bodies and provides independent request clones without patching global APIs. Upload bodies must be finite and fit in memory. Response streaming over TCP is supported.

The runtime has been verified on Linux with txiki.js 26.6.0.
