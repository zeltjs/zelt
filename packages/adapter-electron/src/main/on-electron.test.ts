import { Controller, createApp, Get, http } from '@zeltjs/core';
import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IpcFetchRequest, IpcFetchResponse } from '../shared/ipc.types';
import { onElectron } from './on-electron';
import { ZeltElectronIpcFeatureNotFoundError } from './on-electron.exceptions';

type IpcHandler = (event: IpcMainInvokeEvent, payload: IpcFetchRequest) => unknown;

const createFakeIpcMain = () => {
  const handlers = new Map<string, IpcHandler>();
  const removedChannels: string[] = [];
  return {
    handlers,
    removedChannels,
    ipcMain: {
      handle: (channel: string, listener: IpcHandler) => {
        handlers.set(channel, listener);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
        removedChannels.push(channel);
      },
    },
    invoke: (channel: string, payload: IpcFetchRequest): Promise<IpcFetchResponse> => {
      const handler = handlers.get(channel);
      if (handler === undefined) throw new Error(`no ipcMain handler registered for ${channel}`);
      return handler({} as IpcMainInvokeEvent, payload) as Promise<IpcFetchResponse>;
    },
  };
};

let fakeIpcMain = createFakeIpcMain();

vi.mock('electron', () => ({
  get app() {
    return { whenReady: () => Promise.resolve(), quit: () => {} };
  },
  get ipcMain() {
    return fakeIpcMain.ipcMain;
  },
  BrowserWindow: class {},
  dialog: {},
  Menu: class {},
  protocol: {},
  screen: {},
  shell: {},
}));

const getRequest = (path: string): IpcFetchRequest => ({
  method: 'GET',
  path,
  headers: [],
  body: { kind: 'none' },
});

@Controller('/')
class HttpOnlyController {
  @Get('/http-only')
  getHttpOnly() {
    return { scope: 'http' };
  }
}

@Controller('/')
class McpOnlyController {
  @Get('/mcp-only')
  getMcpOnly() {
    return { scope: 'mcp' };
  }
}

const createMultiFeatureApp = () =>
  createApp([
    http({ controllers: [HttpOnlyController] }),
    http({ name: 'mcp' as const, controllers: [McpOnlyController] }),
  ]);

describe('onElectron', () => {
  beforeEach(() => {
    fakeIpcMain = createFakeIpcMain();
  });

  describe('default ipcFeature binding', () => {
    it('binds the http feature to the IPC channel and exposes other features as listen namespaces', async () => {
      const electronApp = await onElectron(createMultiFeatureApp());

      try {
        const response = await fakeIpcMain.invoke('http://zelt-ipc', getRequest('/http-only'));
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ kind: 'text', value: JSON.stringify({ scope: 'http' }) });

        expect(electronApp.mcp).toHaveProperty('listen');
        expect('listen' in electronApp).toBe(false);
      } finally {
        await electronApp.shutdown();
      }
    });
  });

  describe('mcp.listen', () => {
    it('serves the mcp feature over a real TCP listener while the http feature stays IPC-only', async () => {
      const electronApp = await onElectron(createMultiFeatureApp());

      try {
        const handle = await electronApp.mcp.listen({ port: 0, hostname: '127.0.0.1' });

        try {
          const mcpOk = await fetch(`http://127.0.0.1:${handle.address.port}/mcp-only`);
          expect(mcpOk.status).toBe(200);
          await expect(mcpOk.json()).resolves.toEqual({ scope: 'mcp' });

          const httpMiss = await fetch(`http://127.0.0.1:${handle.address.port}/http-only`);
          expect(httpMiss.status).toBe(404);
        } finally {
          await handle.shutdown();
        }
      } finally {
        await electronApp.shutdown();
      }
    });
  });

  describe('ipcFeature option', () => {
    it('binds the requested feature key to the IPC channel instead of the default http feature', async () => {
      const electronApp = await onElectron(createMultiFeatureApp(), { ipcFeature: 'mcp' });

      try {
        const response = await fakeIpcMain.invoke('http://zelt-ipc', getRequest('/mcp-only'));
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ kind: 'text', value: JSON.stringify({ scope: 'mcp' }) });

        const httpMiss = await fakeIpcMain.invoke('http://zelt-ipc', getRequest('/http-only'));
        expect(httpMiss.status).toBe(404);
      } finally {
        await electronApp.shutdown();
      }
    });
  });

  describe('missing ipcFeature', () => {
    it('rejects with ZeltElectronIpcFeatureNotFoundError when no feature matches the key', async () => {
      await expect(
        onElectron(createMultiFeatureApp(), { ipcFeature: 'does-not-exist' }),
      ).rejects.toThrow(ZeltElectronIpcFeatureNotFoundError);
    });

    it('shuts down the already-started runtime instead of leaking it', async () => {
      const shutdownSpy = vi.fn();
      const mcpFeature = http({ name: 'mcp' as const, controllers: [McpOnlyController] });
      mcpFeature.registerShutdown(shutdownSpy);

      const app = createApp([http({ controllers: [HttpOnlyController] }), mcpFeature]);

      await expect(onElectron(app, { ipcFeature: 'does-not-exist' })).rejects.toThrow(
        ZeltElectronIpcFeatureNotFoundError,
      );

      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('removes the IPC handler and closes listening servers registered via feature shutdown', async () => {
      const electronApp = await onElectron(createMultiFeatureApp());
      const handle = await electronApp.mcp.listen({ port: 0, hostname: '127.0.0.1' });

      await electronApp.shutdown();

      expect(fakeIpcMain.removedChannels).toContain('http://zelt-ipc');
      await expect(fetch(`http://127.0.0.1:${handle.address.port}/mcp-only`)).rejects.toThrow();
    });
  });
});
