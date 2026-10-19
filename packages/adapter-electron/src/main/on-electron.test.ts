import type { ConfiguredFeature, FeatureApp, ReservedAppKey, ZeltPrebuilt } from '@zeltjs/core';
import {
  Command,
  Controller,
  command,
  createApp,
  FeatureInjectionError,
  Get,
  HttpFeature,
  http,
  httpServer,
  injectFeature,
  LifecycleManager,
  RuntimeShutdownService,
} from '@zeltjs/core';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { IpcFetchRequest, IpcFetchResponse } from '../shared/ipc.types';
import { ElectronIpcFeature, electronIpc } from './electron-ipc.feature';
import type { ElectronAppOptions } from './on-electron';
import { onElectron } from './on-electron';

const assertReservedNames = (name: ReservedAppKey, mixed: 'desktop' | 'shutdown'): void => {
  // @ts-expect-error IPC feature names exclude reserved app keys
  electronIpc({ name });
  // @ts-expect-error literal reserved names must not widen during inference
  electronIpc({ name: 'shutdown' });
  // @ts-expect-error unions containing reserved names are also rejected
  electronIpc({ name: mixed });
  expectTypeOf(electronIpc({ name: 'api' }).key).toEqualTypeOf<'api'>();
  expectTypeOf(electronIpc({ name: 'init' }).key).toEqualTypeOf<'init'>();
};
void assertReservedNames;

type IpcHandler = (event: IpcMainInvokeEvent, payload: IpcFetchRequest) => unknown;
const createFakeIpcMain = () => {
  const handlers = new Map<string, IpcHandler>();
  const removedChannels: string[] = [];
  return {
    handlers,
    removedChannels,
    ipcMain: {
      handle: (channel: string, listener: IpcHandler) => {
        if (handlers.has(channel)) throw new Error(`Handler already registered for ${channel}`);
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
const whenReady = vi.fn(() => Promise.resolve());
const quit = vi.fn();
vi.mock('electron', () => ({
  get app() {
    return { whenReady, quit };
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

const cleanups: (() => Promise<void>)[] = [];
const start = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options?: ElectronAppOptions,
) => {
  const runtime = await onElectron(app, options);
  cleanups.push(runtime.shutdown);
  return runtime;
};
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
    httpServer(),
    http({ name: 'mcp', controllers: [McpOnlyController] }),
    electronIpc(),
  ]);
beforeEach(() => {
  fakeIpcMain = createFakeIpcMain();
  whenReady.mockReset().mockResolvedValue();
  quit.mockClear();
});
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('onElectron', () => {
  it('returns the unchanged runtime without requiring HTTP or registering IPC', async () => {
    const app = createApp([]);
    const createRuntime = vi.spyOn(app, 'createRuntime');
    const runtime = await start(app);
    expect(runtime).toBe(await createRuntime.mock.results[0]?.value);
    expect(runtime.shutdown).toBe((await runtime.get(RuntimeShutdownService)).shutdown);
    expectTypeOf(runtime).not.toHaveProperty('electronIpc');
    expect(fakeIpcMain.handlers.size).toBe(0);
    expect(whenReady).not.toHaveBeenCalled();
  });
  it('keeps HTTP usable without an IPC feature', async () => {
    const runtime = await start(createApp([http({ controllers: [HttpOnlyController] })]));
    expectTypeOf(runtime).not.toHaveProperty('electronIpc');
    expect(await (await runtime.http.request('/http-only')).json()).toEqual({ scope: 'http' });
    expect(fakeIpcMain.handlers.size).toBe(0);
  });
  it('forwards context, config, warmup and prebuilt options to createRuntime', async () => {
    const prebuilt: ZeltPrebuilt = { version: 1, features: {} };
    let observedPrebuilt: ZeltPrebuilt | undefined;
    const observer: ConfiguredFeature<'observer', Record<never, never>> = {
      key: 'observer',
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: (resolver) => {
        observedPrebuilt = resolver.prebuilt;
        return {};
      },
    };
    const app = createApp([observer]);
    const createRuntime = vi.spyOn(app, 'createRuntime');
    await start(app, { contextMode: 'sync', configs: [], warmup: false, prebuilt });
    expect(createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        contextMode: 'sync',
        configs: [],
        warmup: false,
        prebuilt,
      }),
    );
    expect(observedPrebuilt).toBe(prebuilt);
  });
  it('removes the old implicit IPC options from the public contract', () => {
    expectTypeOf<ElectronAppOptions>().not.toHaveProperty('ipcFeature');
    expectTypeOf<ElectronAppOptions>().not.toHaveProperty('ipcChannel');
  });
});

describe('electronIpc', () => {
  it('prepares Electron without registering a handler until listen is called', async () => {
    const runtime = await start(createApp([electronIpc()]), { warmup: false });
    expectTypeOf(runtime).not.toHaveProperty('http');
    expect(whenReady).toHaveBeenCalledOnce();
    expect(fakeIpcMain.handlers.size).toBe(0);
    expect(runtime).not.toHaveProperty('ipc');
    expect(runtime.electronIpc).toBe(
      runtime.getFeatureEntries(ElectronIpcFeature)[0]?.capabilities,
    );
  });
  it('waits for Electron readiness before returning the runtime', async () => {
    const ready = Promise.withResolvers<void>();
    whenReady.mockReturnValueOnce(ready.promise);
    let returned = false;
    const starting = start(createApp([electronIpc()])).then((runtime) => {
      returned = true;
      return runtime;
    });
    await vi.waitFor(() => expect(whenReady).toHaveBeenCalledOnce());
    expect(returned).toBe(false);
    ready.resolve();
    await starting;
  });
  it('binds the supplied HTTP capabilities to the default channel', async () => {
    const runtime = await start(createMultiFeatureApp());
    const binding = await runtime.electronIpc.listen(runtime.http);
    expect(binding.channel).toBe('http://zelt-ipc');
    const response = await fakeIpcMain.invoke(binding.channel, getRequest('/http-only'));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ kind: 'text', value: JSON.stringify({ scope: 'http' }) });
    expect(runtime.http).toBe(runtime.getFeatureEntries(HttpFeature)[0]?.capabilities);
    expect('listen' in runtime.http).toBe(false);
    expect('listen' in runtime).toBe(false);
  });
  it('binds named HTTP features to separate channels through a named IPC feature', async () => {
    const runtime = await start(
      createApp([
        http({ name: 'publicApi', controllers: [HttpOnlyController] }),
        http({ name: 'adminApi', controllers: [McpOnlyController] }),
        electronIpc({ name: 'desktop' }),
      ]),
    );
    expectTypeOf(runtime).not.toHaveProperty('electronIpc');
    expect(runtime.desktop).toBe(runtime.getFeatureEntries(ElectronIpcFeature)[0]?.capabilities);
    await runtime.desktop.listen(runtime.publicApi, { channel: 'http://public' });
    await runtime.desktop.listen(runtime.adminApi, { channel: 'https://admin' });
    expect((await fakeIpcMain.invoke('http://public', getRequest('/http-only'))).status).toBe(200);
    expect((await fakeIpcMain.invoke('https://admin', getRequest('/mcp-only'))).status).toBe(200);
    expect((await fakeIpcMain.invoke('http://public', getRequest('/mcp-only'))).status).toBe(404);
    expect((await fakeIpcMain.invoke('https://admin', getRequest('/http-only'))).status).toBe(404);
  });
  it('uses the same capability through injectFeature during command execution', async () => {
    @Command({ name: 'serve' })
    class Serve {
      private readonly ipc = injectFeature(ElectronIpcFeature);
      private readonly api = injectFeature(HttpFeature);
      async run() {
        await this.ipc.listen(this.api);
      }
    }
    const runtime = await start(
      createApp([command([Serve]), http({ controllers: [HttpOnlyController] }), electronIpc()]),
    );
    expect((await runtime.command.execCommand(['serve'])).exitCode).toBe(0);
    expect((await fakeIpcMain.invoke('http://zelt-ipc', getRequest('/http-only'))).status).toBe(
      200,
    );
  });
  it('accepts structural HTTP targets without looking up a feature class', async () => {
    const runtime = await start(createApp([electronIpc()]));
    const target = {
      message: 'custom',
      async fetch() {
        return new Response(this.message);
      },
    };
    await runtime.electronIpc.listen(target);
    expect((await fakeIpcMain.invoke('http://zelt-ipc', getRequest('/'))).body).toEqual({
      kind: 'text',
      value: 'custom',
    });
  });
  it('keeps TCP and IPC bindings independent', async () => {
    const runtime = await start(createMultiFeatureApp());
    await runtime.electronIpc.listen(runtime.http);
    const server = await runtime.httpServer.listen(runtime.mcp, { port: 0, hostname: '127.0.0.1' });
    const url = `http://127.0.0.1:${server.address.port}`;
    expect(await (await fetch(`${url}/mcp-only`)).json()).toEqual({ scope: 'mcp' });
    expect((await fetch(`${url}/http-only`)).status).toBe(404);
    await runtime.shutdown();
    expect(fakeIpcMain.handlers.size).toBe(0);
    await expect(fetch(`${url}/mcp-only`)).rejects.toThrow();
  });
  it('removes each binding once and lets a closed channel be rebound', async () => {
    const runtime = await start(createMultiFeatureApp());
    const first = await runtime.electronIpc.listen(runtime.http);
    await Promise.all([first.shutdown(), first.shutdown()]);
    expect(fakeIpcMain.handlers.size).toBe(0);
    await runtime.electronIpc.listen(runtime.mcp);
    await first.shutdown();
    expect((await fakeIpcMain.invoke(first.channel, getRequest('/mcp-only'))).status).toBe(200);
    await Promise.all([runtime.shutdown(), runtime.shutdown()]);
    expect(fakeIpcMain.removedChannels).toEqual([first.channel, first.channel]);
    expect(quit).toHaveBeenCalledOnce();
    expect(() => runtime.electronIpc.listen(runtime.http)).toThrow(FeatureInjectionError);
  });
  it('preserves the existing binding when native registration fails', async () => {
    const runtime = await start(createMultiFeatureApp());
    await runtime.electronIpc.listen(runtime.http);
    await expect(runtime.electronIpc.listen(runtime.mcp)).rejects.toThrow(
      'Handler already registered',
    );
    expect((await fakeIpcMain.invoke('http://zelt-ipc', getRequest('/http-only'))).status).toBe(
      200,
    );
    expect(fakeIpcMain.removedChannels).toEqual([]);
    await runtime.shutdown();
    expect(fakeIpcMain.removedChannels).toEqual(['http://zelt-ipc']);
  });
  it('retains IPC when a shutdown guard refuses and removes it once on retry', async () => {
    const runtime = await start(createMultiFeatureApp());
    await runtime.electronIpc.listen(runtime.http);
    const lifecycle = await runtime.get(LifecycleManager);
    let blocked = true;
    lifecycle.register({
      startup: () => {},
      assertCanShutdown: () => {
        if (blocked) throw new Error('shutdown refused');
      },
      shutdown: () => {},
    });
    await lifecycle.startupPending();
    try {
      await expect(runtime.shutdown()).rejects.toThrow('shutdown refused');
      expect(fakeIpcMain.removedChannels).toEqual([]);
      expect((await fakeIpcMain.invoke('http://zelt-ipc', getRequest('/http-only'))).status).toBe(
        200,
      );
    } finally {
      blocked = false;
      await Promise.all([runtime.shutdown(), runtime.shutdown()]);
    }
    expect(fakeIpcMain.removedChannels).toEqual(['http://zelt-ipc']);
  });
  it('rolls back a new handler when shutdown registration is already closed', async () => {
    const runtime = await start(createMultiFeatureApp());
    const gate = Promise.withResolvers<void>();
    runtime.registerShutdown(() => gate.promise);
    const stopping = runtime.shutdown();
    try {
      await expect(runtime.electronIpc.listen(runtime.http)).rejects.toThrow(
        'register shutdown callback',
      );
      expect(fakeIpcMain.handlers.size).toBe(0);
    } finally {
      gate.resolve();
      await stopping;
    }
  });
  it('isolates handler ownership between runtimes', async () => {
    const app = createMultiFeatureApp();
    const first = await start(app);
    const second = await start(app);
    await first.electronIpc.listen(first.http, { channel: 'http://first' });
    await second.electronIpc.listen(second.mcp, { channel: 'http://second' });
    await first.shutdown();
    expect([...fakeIpcMain.handlers.keys()]).toEqual(['http://second']);
    expect((await fakeIpcMain.invoke('http://second', getRequest('/mcp-only'))).status).toBe(200);
  });
  it('cleans up realized features when Electron startup fails', async () => {
    const cleanup = vi.fn();
    const feature: ConfiguredFeature<'cleanup', Record<never, never>> = {
      key: 'cleanup',
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: (resolver) => {
        resolver.registerShutdown(cleanup);
        return {};
      },
    };
    whenReady.mockRejectedValueOnce(new Error('Electron startup failed'));
    await expect(onElectron(createApp([feature, electronIpc()]))).rejects.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(fakeIpcMain.handlers.size).toBe(0);
  });
});
