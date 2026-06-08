import type { ContextBridge, IpcRenderer } from 'electron';

import type { IpcFetchRequest, IpcFetchResponse } from '../shared/ipc.types';

const DEFAULT_IPC_CHANNEL = 'http://zelt-ipc';

export type ExposeIpcOptions = {
  readonly channel?: string;
};

type ElectronPreload = {
  readonly contextBridge: ContextBridge;
  readonly ipcRenderer: IpcRenderer;
};

// In the preload context electron is only available via require (no ESM in preload).
const loadElectron = (): ElectronPreload => {
  const mod: ElectronPreload = require('electron');
  return mod;
};

export const exposeIpc = (options: ExposeIpcOptions = {}): void => {
  const channel = options.channel ?? DEFAULT_IPC_CHANNEL;
  const { contextBridge, ipcRenderer } = loadElectron();

  const sender = (request: IpcFetchRequest): Promise<IpcFetchResponse> =>
    ipcRenderer.invoke(channel, request);

  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld(channel, sender);
  } else {
    Reflect.set(globalThis, channel, sender);
  }
};
