---
sidebar_label: Window Management
---

# Window Management

The Electron adapter provides injectable services for managing `BrowserWindow` instances through Zelt's DI system.

## ElectronAdaptor

`ElectronAdaptor` is a lifecycle service that wraps Electron's core APIs. It resolves after `app.whenReady()`, giving you safe access to Electron primitives.

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { ElectronAdaptor } from '@zeltjs/adapter-electron';
// ---cut---
@Injectable()
export class AppLifecycleService {
  constructor(private electron = inject(ElectronAdaptor)) {}

  async initialize() {
    const { app, ipcMain, dialog } = this.electron.ready;
  }
}
```

### Available APIs

The `ready` property exposes:

| Property | Type | Description |
|----------|------|-------------|
| `app` | `App` | Electron app instance |
| `ipcMain` | `IpcMain` | IPC main module |
| `protocol` | `Protocol` | Protocol handler |
| `shell` | `Shell` | Shell integration |
| `screen` | `Screen` | Display info |
| `dialog` | `Dialog` | Native dialogs |
| `Menu` | `typeof Menu` | Menu class |
| `createBrowserWindow` | `(options) => BrowserWindow` | Create a window |
| `getAllWindows` | `() => BrowserWindow[]` | List all windows |
| `fromWebContents` | `(webContents) => BrowserWindow \| null` | Find window by web contents |
| `fromId` | `(id) => BrowserWindow \| null` | Find window by ID |
| `getFocusedWindow` | `() => BrowserWindow \| null` | Get focused window |

## WindowDefinition

Define windows as data:

```typescript
import type { WindowDefinition } from '@zeltjs/adapter-electron';
declare const join: (...paths: string[]) => string;
// ---cut---
const mainWindow: WindowDefinition = {
  id: 'main',
  loadTarget: { type: 'file', path: join(__dirname, '../renderer/index.html') },
  options: {
    width: 900,
    height: 670,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
    },
  },
};
```

### WindowLoadTarget

| Type | Properties | Description |
|------|-----------|-------------|
| `{ type: 'file' }` | `path: string` | Load a local HTML file |
| `{ type: 'url' }` | `url: string` | Load a URL (useful for dev server) |

## Creating Windows via DI

Encapsulate window creation in a service:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import type { WindowDefinition, WindowLoadTarget } from '@zeltjs/adapter-electron';
declare const join: (...paths: string[]) => string;
declare class EnvService { isDevelopment: boolean; rendererUrl?: string; }
// ---cut---
@Injectable()
export class MainWindow {
  constructor(private env = inject(EnvService)) {}

  create(): WindowDefinition {
    const loadTarget: WindowLoadTarget =
      this.env.isDevelopment && this.env.rendererUrl
        ? { type: 'url', url: this.env.rendererUrl }
        : { type: 'file', path: join(__dirname, '../renderer/index.html') };

    return {
      id: 'main',
      loadTarget,
      options: {
        width: 900,
        height: 670,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: join(__dirname, '../preload/index.js'),
          sandbox: true,
        },
      },
    };
  }
}
```

## Window Registry

`ElectronWindowRegistryService` manages the lifecycle of multiple windows:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { ElectronWindowRegistryService } from '@zeltjs/adapter-electron';
import type { WindowDefinition } from '@zeltjs/adapter-electron';
// ---cut---
@Injectable()
export class WindowManagerService {
  constructor(private registry = inject(ElectronWindowRegistryService)) {}

  openMain(definition: WindowDefinition) {
    const handle = this.registry.open(definition);
    handle.on('ready-to-show', () => handle.show());
    return handle;
  }

  closeAll() {
    this.registry.closeAll();
  }

  get windowCount() {
    return this.registry.count();
  }
}
```

### API

| Method | Description |
|--------|-------------|
| `open(definition)` | Open a new window or focus an existing one with the same ID |
| `close(id)` | Close a specific window |
| `closeAll()` | Close all managed windows |
| `count()` | Number of open windows |

## WindowHandle

`open()` returns a `WindowHandle` — a safe wrapper around `BrowserWindow`:

| Method | Description |
|--------|-------------|
| `close()` | Close the window |
| `focus()` | Focus the window |
| `show()` | Show the window |
| `isDestroyed()` | Check if destroyed |
| `getTitle()` | Get window title |
| `getBounds()` / `setBounds()` | Get/set window position and size |
| `loadFile(path)` / `loadURL(url)` | Load content |
| `on(event, handler)` | Listen to `'closed'` or `'ready-to-show'` |
| `webContents.send(channel, ...args)` | Send to renderer |
