# @zeltjs/adapter-electron

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Electron adapter for Zelt applications. Your Zelt app runs in the main process; the renderer calls it over IPC with the standard Fetch API shape.

**[Read the Documentation](https://zeltjs.com/docs/getting-started/electron)**

## Installation

```bash
npm install @zeltjs/adapter-electron @zeltjs/core
```

## Usage

### Main process

```typescript
import { createApp, http, Controller, Get } from '@zeltjs/core';
import { onElectron } from '@zeltjs/adapter-electron';

@Controller('/api')
class ApiController {
  @Get('/status')
  status() {
    return { status: 'ok' };
  }
}

const app = createApp([http({ controllers: [ApiController] })]);

const electronZelt = await onElectron(app, { ipcChannel: 'http://zelt-app' });
```

### Preload script

```typescript
import { exposeIpc } from '@zeltjs/adapter-electron/preload';

exposeIpc({ channel: 'http://zelt-app' });
```

### Renderer

```typescript
import { ipcFetch } from '@zeltjs/adapter-electron/renderer';

const response = await ipcFetch('http://zelt-app/api/status', undefined, {
  channel: 'http://zelt-app',
});
const data = await response.json();
```

The channel string must match across all three layers.

### Multiple HTTP features

Configure additional named `http()` features alongside the renderer-facing one:

```typescript
const app = createApp([
  http({ controllers: [ApiController] }),
  http({ name: 'mcp', controllers: [McpController] }),
]);

const electronZelt = await onElectron(app);
```

By default the `http` feature is bound to the IPC bridge; pass `ipcFeature` to bind a different one instead:

```typescript
const electronZelt = await onElectron(app, { ipcFeature: 'mcp' });
```

Any other feature can be served over TCP instead of IPC — handy for exposing an MCP server or other external API from the same runtime and shared services, keeping only the router and trust boundary separate from the renderer-facing API:

```typescript
await electronZelt.mcp.listen({ port: 8765, hostname: '127.0.0.1' });
```

Breaking change: the old `electronZelt.fetch` shorthand is gone — use `electronZelt.http.fetch` instead.

## Learn More

- [Getting Started with Electron](https://zeltjs.com/docs/getting-started/electron) — full walkthrough with electron-vite
- [IPC Bridge](https://zeltjs.com/docs/electron/ipc-bridge) — channel configuration, `ipcEvent()` access to the underlying `IpcMainInvokeEvent`, type-safe clients with `@zeltjs/hono-client`, shutdown wiring
- [Window Management](https://zeltjs.com/docs/electron/window-management) — managing BrowserWindows through Zelt DI
