---
title: tinyjs Desktop
---

[tinyjs](https://tinyjs.app/) combines a txiki.js backend with a native system WebView. `@zeltjs/adapter-tinyjs` connects the page to Zelt's HTTP controllers over native IPC, without opening a TCP port.

```sh
npm install @zeltjs/core @zeltjs/adapter-tinyjs
```

Backend entry:

```ts
import { Controller, createApp, Get, http } from '@zeltjs/core';
import { onTinyjs } from '@zeltjs/adapter-tinyjs';

@Controller('/api')
class ApiController {
  @Get('/status')
  status() { return { status: 'ok' }; }
}

const desktop = await onTinyjs(createApp([http({ controllers: [ApiController] })]));
export const api = desktop.api;
export const init = desktop.init;
```

Renderer:

```ts
import { tinyFetch } from '@zeltjs/adapter-tinyjs/renderer';

const response = await tinyFetch('/api/status');
const status = await response.json();
```

The renderer receives a standard `Response`, including status, headers, JSON and binary bodies. Use `createTinyFetch({ feature: 'admin' })` for a named HTTP feature. Limit renderer exposure with `onTinyjs(app, { bridgeFeatures: ['http'] })`.

## Native app and shutdown

Export `init` to attach the native app and ensure Zelt shutdown finishes before tinyjs exits. Inject `TinyjsAppAdaptor` for native `setTitle`, `push` and `quit` operations. Access before `init` or after shutdown fails explicitly.

The backend shares DI services across HTTP features and uses [synchronous context](../async-context). Capture helpers at entry and keep the returned references across `await`.

## Build and package

The [complete task-list example](https://github.com/zeltjs/zelt/tree/main/examples/tinyjs-desktop) includes backend and renderer bundles plus `tinyjs.json`:

```sh
pnpm --filter @zeltjs/adapter-tinyjs... build
pnpm --filter @examples/tinyjs-desktop dev
pnpm --filter @examples/tinyjs-desktop package
```

The build uses Node; the packaged application runs on txiki.js and the OS WebView. Build on the OS you target. Linux was verified with tinyjs 0.50.1, including a real WebView; macOS and Windows require separate verification.

IPC responses are buffered and must finish. Use a feature's optional `.serve()` for streaming/SSE endpoints. Browser cookies are not automatically managed by this bridge. Aborting fetch rejects renderer-side waiting; an already-running backend handler can still finish.
