import { Injectable, inject } from '@zeltjs/core';
import type { BrowserWindow } from 'electron';

import { ElectronApp } from './electron-app';
import type { WindowDefinition, WindowHandle, WindowRuntime } from './window.types';

export const createWindowHandle = (win: BrowserWindow): WindowHandle => ({
  id: win.id,
  native: win,
  close: () => win.close(),
  focus: () => win.focus(),
  show: () => win.show(),
  isDestroyed: () => win.isDestroyed(),
  getTitle: () => win.getTitle(),
  getBounds: () => win.getBounds(),
  setBounds: (bounds) => win.setBounds(bounds),
  loadFile: (path) => {
    void win.loadFile(path);
  },
  loadURL: (url) => {
    void win.loadURL(url);
  },
  on: (event, handler) => {
    win.on(event as 'closed', handler);
    return createWindowHandle(win);
  },
  removeListener: (event, handler) => {
    win.removeListener(event as 'closed', handler as () => void);
  },
  webContents: {
    send: (channel, ...args) => win.webContents.send(channel, ...args),
    setWindowOpenHandler: (handler) => win.webContents.setWindowOpenHandler(handler),
  },
});

@Injectable()
export class ElectronWindowRuntime implements WindowRuntime {
  constructor(private readonly electronApp: ElectronApp = inject(ElectronApp)) {}

  open(definition: WindowDefinition): WindowHandle {
    const handle = createWindowHandle(
      this.electronApp.ready.createBrowserWindow(definition.options),
    );

    if (definition.loadTarget.type === 'url') {
      handle.loadURL(definition.loadTarget.url);
    } else {
      handle.loadFile(definition.loadTarget.path);
    }

    return handle;
  }
}
