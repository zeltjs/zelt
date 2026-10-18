import type { RegisteredRuntimeShutdown } from '@zeltjs/core';

export type ElectronIpcChannel = `http://${string}` | `https://${string}`;

export type ElectronIpcListenOptions = {
  readonly channel?: ElectronIpcChannel;
};

export type ElectronIpcHandle = {
  readonly channel: ElectronIpcChannel;
  readonly shutdown: RegisteredRuntimeShutdown;
};
