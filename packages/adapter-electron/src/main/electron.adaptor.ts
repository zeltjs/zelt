import type { Lifecycle, ReadyValue } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Dialog,
  IpcMain,
  Menu,
  Protocol,
  Screen,
  Shell,
  WebContents,
} from 'electron';

export type ElectronReady = {
  readonly app: App;
  readonly ipcMain: IpcMain;
  readonly protocol: Protocol;
  readonly shell: Shell;
  readonly screen: Screen;
  readonly dialog: Dialog;
  readonly Menu: typeof Menu;
  readonly createBrowserWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  readonly getAllWindows: () => BrowserWindow[];
  readonly fromWebContents: (webContents: WebContents) => BrowserWindow | null;
  readonly fromId: (id: number) => BrowserWindow | null;
  readonly getFocusedWindow: () => BrowserWindow | null;
};

@Injectable()
export class ElectronAdaptor implements Lifecycle<ElectronReady> {
  readonly ready: ReadyValue<ElectronReady>;

  constructor(lifecycleManager = inject(LifecycleManager)) {
    this.ready = lifecycleManager.register(this);
  }

  async startup(): Promise<ElectronReady> {
    const {
      app,
      BrowserWindow: BW,
      dialog,
      ipcMain,
      Menu,
      protocol,
      screen,
      shell,
    } = await import('electron');

    await app.whenReady();

    return {
      app,
      ipcMain,
      protocol,
      shell,
      screen,
      dialog,
      Menu,
      createBrowserWindow: (options: BrowserWindowConstructorOptions) => new BW(options),
      getAllWindows: () => BW.getAllWindows(),
      fromWebContents: (wc: WebContents) => BW.fromWebContents(wc),
      fromId: (id: number) => BW.fromId(id),
      getFocusedWindow: () => BW.getFocusedWindow(),
    };
  }

  shutdown(): void {
    this.ready.app.quit();
  }
}
