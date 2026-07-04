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

## Learn More

- [Getting Started with Electron](https://zeltjs.com/docs/getting-started/electron) — full walkthrough with electron-vite
- [IPC Bridge](https://zeltjs.com/docs/electron/ipc-bridge) — channel configuration, `ipcEvent()` access to the underlying `IpcMainInvokeEvent`, type-safe clients with `@zeltjs/hono-client`, shutdown wiring
- [Window Management](https://zeltjs.com/docs/electron/window-management) — managing BrowserWindows through Zelt DI
