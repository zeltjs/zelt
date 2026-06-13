---
sidebar_label: IPC Bridge
---

# IPC Bridge

The Electron adapter replaces HTTP sockets with Electron's IPC mechanism. Standard `Request`/`Response` objects are serialized into IPC-safe payloads, sent between processes, and deserialized on the other side — your controllers see the same Web Fetch API as any other adapter.

## How It Works

```
Renderer                    Preload                     Main
────────                    ───────                     ────
ipcFetch(req)
  → toIpcRequest(req)
    → globalThis[channel](payload)
                            ipcRenderer.invoke(channel, payload)
                                                        ipcMain.handle(channel, payload)
                                                          → toRequest(payload)
                                                          → app.fetch(request)
                                                          → toIpcResponse(response)
                            ← IpcFetchResponse
  ← toResponse(payload)
  ← Response
```

Text content (JSON, HTML, XML) is serialized as strings; binary content as `ArrayBuffer`.

## Configuration

All three layers must agree on the same channel string:

```typescript
import { createApp, http } from '@zeltjs/core';
import { onElectron } from '@zeltjs/adapter-electron';
import { exposeIpc } from '@zeltjs/adapter-electron/preload';
import { ipcFetch } from '@zeltjs/adapter-electron/renderer';
const app = createApp([http({ controllers: [] })]);
const input = new Request('http://zelt-app/hello');
const init = undefined;
// ---cut---
// main
const electronZelt = await onElectron(app, { ipcChannel: 'http://zelt-app' });

// preload
exposeIpc({ channel: 'http://zelt-app' });

// renderer
ipcFetch(input, init, { channel: 'http://zelt-app' });
```

The channel must start with `http://` or `https://`. The default is `'http://zelt-ipc'` if omitted.

## Main Process: `onElectron()`

```typescript
import { createApp, http } from '@zeltjs/core';
import { onElectron } from '@zeltjs/adapter-electron';
const app = createApp([http({ controllers: [] })]);
// ---cut---
const electronZelt = await onElectron(app, {
  ipcChannel: 'http://zelt-app',
  warmup: true, // default: resolve all controllers at startup
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ipcChannel` | `` `http://${string}` \| `https://${string}` `` | `'http://zelt-ipc'` | IPC channel identifier |
| `warmup` | `boolean` | `true` | Resolve all controllers at startup |

### Return Value (`OnElectronApp`)

| Property | Type | Description |
|----------|------|-------------|
| `fetch` | `(request: Request) => Promise<Response>` | Handle a request directly |
| `shutdown` | `() => Promise<void>` | Graceful shutdown |
| `get` | `<T>(Class) => Promise<T>` | Resolve a service from DI |

### Warmup

By default, `onElectron()` eagerly resolves all controllers at startup (`warmup: true`). This ensures services are initialized before the first request. Set `warmup: false` for lazy initialization on first request.

## Preload Script: `exposeIpc()`

```typescript
import { exposeIpc } from '@zeltjs/adapter-electron/preload';
// ---cut---
exposeIpc({ channel: 'http://zelt-app' });
```

`exposeIpc()` registers an IPC sender function and exposes it to the renderer via `contextBridge.exposeInMainWorld()` (or `globalThis` if context isolation is disabled).

The exposed key is the channel string itself, so `ipcFetch` on the renderer side can look it up from `globalThis[channel]`.

## Renderer: `ipcFetch()`

```typescript
import { ipcFetch } from '@zeltjs/adapter-electron/renderer';
// ---cut---
const response = await ipcFetch('http://zelt-app/hello/world', undefined, {
  channel: 'http://zelt-app',
});
const data = await response.json();
```

`ipcFetch()` has the same signature as `fetch()`, plus an optional third argument for the channel. It converts the request into an IPC payload, sends it through the preload bridge, and returns a standard `Response`.

### Creating a Wrapper

In practice, wrap `ipcFetch` so the channel is configured once:

```typescript
import { ipcFetch } from '@zeltjs/adapter-electron/renderer';
// ---cut---
const CHANNEL = 'http://zelt-app';

export const apiFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  ipcFetch(input, init, { channel: CHANNEL });
```

### Using with Hono Client

For type-safe API calls, combine with [`@zeltjs/hono-client`](../hono-client):

```typescript
// @noErrors
import { hc } from 'hono/client';
import { ipcFetch } from '@zeltjs/adapter-electron/renderer';
import type { AppType } from '../../main/entry/app-type.generated';

const zeltIpcFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  ipcFetch(input, init, { channel: 'http://zelt-app' });

export const client = hc<AppType>('http://zelt-app', {
  fetch: zeltIpcFetch,
});
```

## Accessing the IPC Event

In controllers, use `ipcEvent()` to access the underlying `IpcMainInvokeEvent`:

```typescript
import { Controller, Get } from '@zeltjs/core';
import { ipcEvent } from '@zeltjs/adapter-electron';
// ---cut---
@Controller('/system')
export class SystemController {
  @Get('/sender')
  getSender() {
    const event = ipcEvent();
    return { processId: event?.processId };
  }
}
```

## Shutdown

Connect Zelt shutdown to Electron's quit lifecycle:

```typescript
import { createApp, http } from '@zeltjs/core';
import { ElectronAdaptor, onElectron } from '@zeltjs/adapter-electron';
const app = createApp([http({ controllers: [] })]);
// ---cut---
const electronZelt = await onElectron(app, { ipcChannel: 'http://zelt-app' });

const electronApp = await electronZelt.get(ElectronAdaptor);
electronApp.ready.app.on('will-quit', () => {
  void electronZelt.shutdown();
});
```

Using `will-quit` keeps the HTTP bridge alive until Electron is actually quitting, so the renderer can send final IPC calls during teardown.
