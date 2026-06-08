import {inject, Injectable} from '@zeltjs/core';
import type {BrowserWindow} from 'electron';

import type {WindowDefinition, WindowHandle, WindowRuntime} from './window.types';
import {match} from "ts-pattern";
import {ElectronAdaptor} from "./electron.adaptor";

@Injectable()
export class ElectronWindowRuntimeService implements WindowRuntime {
  constructor(private readonly electronApp: ElectronAdaptor = inject(ElectronAdaptor)) {
  }

  open(definition: WindowDefinition): WindowHandle {
    const handle = this.createWindowHandle(
      this.electronApp.ready.createBrowserWindow(definition.options),
    );

    if (definition.loadTarget.type === 'url') {
      handle.loadURL(definition.loadTarget.url);
    } else {
      handle.loadFile(definition.loadTarget.path);
    }

    return handle;
  }

  createWindowHandle(win: BrowserWindow): WindowHandle {
    return {
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
        match(event)
          .with('closed', e => win.on(e, handler))
          .with('ready-to-show', e => win.on(e, handler))
          .exhaustive();
      },
      removeListener: (event, handler) => {
        match(event)
          .with('closed', e => win.removeListener(e, handler))
          .with('ready-to-show', e => win.removeListener(e, handler))
          .exhaustive();
      },
      webContents: {
        send: (channel, ...args) => win.webContents.send(channel, ...args),
        setWindowOpenHandler: (handler) => win.webContents.setWindowOpenHandler(handler),
      },
    }
  };
}
