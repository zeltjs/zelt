import type { Lifecycle, ReadyValue } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Dialog,
  IpcMain,
  Menu as MenuType,
  Protocol,
  Screen,
  Shell,
  WebContents,
} from 'electron';

export type ElectronReady = {
  readonly app: {
    readonly getPath: (name: string) => string;
    readonly getVersion: () => string;
    readonly isPackaged: boolean;
    readonly quit: () => void;
    readonly on: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  readonly ipcMain: IpcMain;
  readonly protocol: Protocol;
  readonly shell: Pick<Shell, 'openExternal'>;
  readonly screen: Screen;
  readonly dialog: Dialog;
  readonly Menu: typeof MenuType;
  readonly createBrowserWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  readonly getAllWindows: () => BrowserWindow[];
  readonly fromWebContents: (webContents: WebContents) => BrowserWindow | null;
  readonly fromId: (id: number) => BrowserWindow | null;
  readonly getFocusedWindow: () => BrowserWindow | null;
};

@Injectable()
export class ElectronApp implements Lifecycle<ElectronReady> {
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
      app: {
        getPath: (name: string) => app.getPath(name as Parameters<typeof app.getPath>[0]),
        getVersion: () => app.getVersion(),
        isPackaged: app.isPackaged,
        quit: () => app.quit(),
        on: (event: string, handler: (...args: unknown[]) => void) => {
          app.on(event as 'ready', handler);
        },
      },
      ipcMain,
      protocol,
      shell: { openExternal: (url: string) => shell.openExternal(url) },
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
