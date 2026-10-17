import type { HttpFetchTarget, RegisterRuntimeShutdown } from '@zeltjs/core';
import { Injectable, inject } from '@zeltjs/core';
import { ElectronAdaptor } from './electron.adaptor';
import type { ElectronIpcHandle, ElectronIpcListenOptions } from './electron-ipc.types';
import { setupIpcBridge } from './ipc-bridge';

@Injectable()
export class ElectronIpcService {
  constructor(private readonly platform = inject(ElectronAdaptor)) {}

  /** @throws {ZeltLifecycleStateError | TypeError} */
  listen(
    http: HttpFetchTarget,
    options: ElectronIpcListenOptions,
    registerShutdown: RegisterRuntimeShutdown,
  ): ElectronIpcHandle {
    const channel = options.channel ?? 'http://zelt-ipc';
    const removeHandler = setupIpcBridge(
      this.platform.ready.ipcMain,
      (request) => http.fetch(request),
      channel,
    );
    try {
      return { channel, shutdown: registerShutdown(removeHandler) };
    } catch (error) {
      removeHandler();
      throw error;
    }
  }
}
