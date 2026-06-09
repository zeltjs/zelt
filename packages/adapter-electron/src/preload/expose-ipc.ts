import { contextBridge, ipcRenderer } from 'electron';

import type { IpcFetchRequest, IpcFetchResponse } from '../shared/ipc.types';

const DEFAULT_IPC_CHANNEL = 'http://zelt-ipc';

export type ExposeIpcOptions = {
  readonly channel?: string;
};

export const exposeIpc = (options: ExposeIpcOptions = {}): void => {
  const channel = options.channel ?? DEFAULT_IPC_CHANNEL;

  const sender = (request: IpcFetchRequest): Promise<IpcFetchResponse> =>
    ipcRenderer.invoke(channel, request);

  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld(channel, sender);
  } else {
    Reflect.set(globalThis, channel, sender);
  }
};
