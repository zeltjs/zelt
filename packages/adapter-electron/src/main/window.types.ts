import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron';

export type WindowId = string;

export type WindowOpenHandlerResult = { readonly action: 'allow' | 'deny' };

export type WindowHandle = {
  readonly id: number;
  readonly native: BrowserWindow;
  close(): void;
  focus(): void;
  show(): void;
  isDestroyed(): boolean;
  getTitle(): string;
  getBounds(): Rectangle;
  setBounds(bounds: Partial<Rectangle>): void;
  loadFile(path: string): void;
  loadURL(url: string): void;
  on(event: 'closed' | 'ready-to-show', handler: () => void): void;
  removeListener(event: 'closed' | 'ready-to-show', handler: (...args: unknown[]) => void): void;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
    setWindowOpenHandler(handler: (details: { url: string }) => WindowOpenHandlerResult): void;
  };
};

export type WindowLoadTarget =
  | { type: 'file'; readonly path: string }
  | { type: 'url'; readonly url: string };

export type WindowDefinition = {
  readonly id: WindowId;
  readonly options: BrowserWindowConstructorOptions;
  readonly loadTarget: WindowLoadTarget;
};

export type WindowRuntime = {
  open(definition: WindowDefinition): WindowHandle;
};
