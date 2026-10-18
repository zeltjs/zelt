# @zeltjs/adapter-tinyjs

Use Zelt as the backend of a [tinyjs](https://tinyjs.app/) desktop app. The native WebView calls your existing HTTP controllers over tinyjs's JSON IPC bridge. No TCP port or custom txiki.js binary is required.

```sh
npm install @zeltjs/core @zeltjs/adapter-tinyjs
```

Backend entry:

```ts
import { createApp, http } from '@zeltjs/core';
import { onTinyjs, tinyjsBridge } from '@zeltjs/adapter-tinyjs';
import { ApiController } from './api.controller';

const desktop = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
export const { api, init } = desktop.bridge.create(desktop.http);
```

Renderer:

```ts
import { tinyFetch } from '@zeltjs/adapter-tinyjs/renderer';

const response = await tinyFetch('/api/status');
const status = await response.json();
```

`tinyFetch` has the standard `fetch` signature and returns a real `Response`. It can be supplied as the custom fetch implementation of a Hono client. `createTinyFetch({ feature: 'admin' })` targets a named HTTP feature; `createTinyFetch({ bridge })` accepts an explicit `tiny.api`-shaped bridge for integration and testing.

The virtual origin defaults to `http://zelt-tinyjs`; absolute URLs must use that origin. Set the same `origin` in `desktop.bridge.create(desktop.http, { origin })` and `createTinyFetch` to change it. Other origins are rejected instead of forwarded to the network.

## Feature and lifecycle wiring

`tinyjsBridge()` declares a bridge factory, just as `lambdaHandler()` declares a handler factory. After creating the runtime, pass the chosen HTTP capability to `desktop.bridge.create(desktop.http)`. Only that target is exposed, under the renderer's default name `http`; other HTTP features are not discovered or published automatically. A Fetch-shaped target with `fetch(request)` also works.

For multiple named targets, pass an explicit map:

```ts
export const { api, init } = desktop.bridge.create(
  new Map([['http', desktop.http], ['admin', desktop.admin]]),
);
```

The renderer selects a map key with `createTinyFetch({ feature: 'admin' })`. Use `tinyjsBridge({ name: 'native' })` to expose the factory as `desktop.native.create(...)`. Services remain shared across HTTP features; an optional `httpServer()` feature can expose selected HTTP capabilities through `app.server.listen(app.http, options)`.

`onTinyjs` returns the runtime without adding root `api` or `init` properties. Both names are available for features. The backend entry still exports the generated `api` and `init` for the tinyjs launcher.

Export `init` so the adapter can attach tinyjs's native app and extend `app.done` with Zelt shutdown. This ensures resources close before tinyjs's standard launcher exits. `init` must run only once. For additional native initialization:

```ts
import type { TinyjsNativeApp } from '@zeltjs/adapter-tinyjs';

const bridge = desktop.bridge.create(desktop.http);
export const api = bridge.api;
export function init(native: TinyjsNativeApp) {
  bridge.init(native);
  native.setTitle('My app');
}
```

Inject `TinyjsAppAdaptor` to access the native app from a controller or service. Its `.native` property provides `setTitle()`, `push()` and `quit()`, and throws before native initialization or after shutdown.

The runtime uses synchronous context. Capture `request()`, `response()` and `middlewareValue()` at entry, as method default parameters, and retain those references across `await`. Backend DI and controller syntax are the same as other Zelt adapters.

## Build and run

The [desktop example](../../examples/tinyjs-desktop) bundles its TypeScript backend and renderer with tsdown, then uses the standard `tinyjs dev` / `tinyjs build` commands. Its frontend is ordinary HTML/CSS/TypeScript. Node is needed only for development/build; the packaged application runs on txiki.js and the system WebView.

The IPC bridge buffers finite request and response bodies, including binary data encoded as base64. HTTP statuses, headers, query strings and HEAD/null-body responses are retained. Infinite response streams/SSE are not supported over this buffered bridge; use the optional TCP server for streaming endpoints. Browser cookies are not automatically stored or attached by the IPC bridge.

An AbortSignal rejects renderer-side waiting promptly; an already-dispatched backend handler may still finish. Native RPC errors and malformed payloads reject instead of becoming successful HTTP responses.

Redirect responses are returned with their original status and Location header; the IPC client does not follow them automatically.

Tested with tinyjs 0.50.1 / txiki.js 26.6.0 on Linux. A user also verified native WebView CRUD and window-title control with tinyjs 0.50.1 on macOS. Build on each target OS; the macOS txiki.js verification rerun, packaged `.app` launch/signing, and Windows verification remain outstanding.
