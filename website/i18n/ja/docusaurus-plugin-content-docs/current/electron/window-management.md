---
sidebar_label: Window Management
---

# ウィンドウ管理

Electron adapterは、Zelt DIシステムを通じて `BrowserWindow` インスタンスを管理するための注入可能なserviceを提供します。

## ElectronAdaptor {#electronadaptor}

`ElectronAdaptor` はElectronのコアAPIをラップするlifecycle serviceです。`app.whenReady()` の後に解決され、Electronプリミティブへの安全なアクセスを提供します。

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

### 利用可能なAPI {#available-apis}

`ready` プロパティは以下を公開します:

| プロパティ | 型 | 説明 |
|----------|------|-------------|
| `app` | `App` | Electronアプリインスタンス |
| `ipcMain` | `IpcMain` | IPC mainモジュール |
| `protocol` | `Protocol` | プロトコルハンドラ |
| `shell` | `Shell` | シェル連携 |
| `screen` | `Screen` | ディスプレイ情報 |
| `dialog` | `Dialog` | ネイティブダイアログ |
| `Menu` | `typeof Menu` | Menuクラス |
| `createBrowserWindow` | `(options) => BrowserWindow` | windowを作成します |
| `getAllWindows` | `() => BrowserWindow[]` | 全windowを一覧します |
| `fromWebContents` | `(webContents) => BrowserWindow \| null` | web contentsからwindowを検索します |
| `fromId` | `(id) => BrowserWindow \| null` | IDからwindowを検索します |
| `getFocusedWindow` | `() => BrowserWindow \| null` | フォーカスされているwindowを取得します |

## WindowDefinition {#windowdefinition}

windowをデータとして定義します:

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

### WindowLoadTarget {#windowloadtarget}

| 型 | プロパティ | 説明 |
|------|-----------|-------------|
| `{ type: 'file' }` | `path: string` | ローカルのHTMLファイルを読み込みます |
| `{ type: 'url' }` | `url: string` | URLを読み込みます(dev serverなどで有用) |

## DI経由でWindowを作成する {#creating-windows-via-di}

window作成をserviceにカプセル化します:

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

## ウィンドウレジストリ {#window-registry}

`ElectronWindowRegistryService` は複数windowのライフサイクルを管理します:

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

### API {#api}

| メソッド | 説明 |
|--------|-------------|
| `open(definition)` | 新しいwindowを開くか、同じIDの既存windowにフォーカスします |
| `close(id)` | 指定したwindowを閉じます |
| `closeAll()` | 管理下の全windowを閉じます |
| `count()` | 開いているwindowの数 |

## WindowHandle {#windowhandle}

`open()` は `WindowHandle` を返します — `BrowserWindow` の安全なラッパーです:

| メソッド | 説明 |
|--------|-------------|
| `close()` | windowを閉じます |
| `focus()` | windowにフォーカスします |
| `show()` | windowを表示します |
| `isDestroyed()` | 破棄済みか確認します |
| `getTitle()` | windowのタイトルを取得します |
| `getBounds()` / `setBounds()` | windowの位置とサイズを取得/設定します |
| `loadFile(path)` / `loadURL(url)` | コンテンツを読み込みます |
| `on(event, handler)` | `'closed'` または `'ready-to-show'` をリッスンします |
| `webContents.send(channel, ...args)` | rendererに送信します |
