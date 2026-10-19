import type { Signal, SignalHandler } from '@zeltjs/core';
import {
  Controller,
  captureContext,
  createApp,
  Env,
  Feature,
  Get,
  http,
  httpServer,
  LifecycleManager,
  Post,
  RuntimeShutdownService,
  request,
  TaskService,
} from '@zeltjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onTxiki } from './on-txiki';

@Controller('/echo')
class EchoController {
  @Post('/override')
  async override(req = request()) {
    return { marker: req.header('X-Override'), body: await req.body() };
  }

  @Get('/')
  async echo(req = request()) {
    const mode = captureContext().mode;
    await Promise.resolve();
    return { id: req.queryParam('id'), mode };
  }
}

const nativeRuntime = () => {
  const listeners = new Map<Signal, SignalHandler>();
  return {
    env: { ZELT_TEST: 'txiki' },
    listeners,
    addSignalListener: vi.fn((signal: Signal, handler: SignalHandler) => {
      listeners.set(signal, handler);
    }),
    removeSignalListener: vi.fn((signal: Signal, handler: SignalHandler) => {
      if (listeners.get(signal) === handler) listeners.delete(signal);
    }),
    exit: vi.fn(),
    serve: vi.fn(() => ({ port: 42001, close: vi.fn(async () => {}) })),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('onTxiki', () => {
  it('applies RequestInit method, headers and body to a Request input', async () => {
    vi.stubGlobal('tjs', nativeRuntime());
    const app = await onTxiki(createApp([http({ controllers: [EchoController] }), httpServer()]), {
      signals: false,
    });
    expect(app.shutdown).toBe((await app.get(RuntimeShutdownService)).shutdown);
    const result = await app.http.request(new Request('http://localhost/echo/override'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Override': 'updated' },
      body: JSON.stringify({ value: 'replacement' }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ marker: 'updated', body: { value: 'replacement' } });
    const original = new Request('http://localhost/echo/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Override': 'original' },
      body: JSON.stringify({ value: 'retained' }),
    });
    const retained = await app.http.request(original, {
      headers: { 'Content-Type': 'application/json', 'X-Override': 'changed' },
    });
    expect(retained.status).toBe(200);
    expect(await retained.json()).toEqual({ marker: 'changed', body: { value: 'retained' } });
    await app.shutdown();
  });

  it('preserves serving after shutdown rejects an active sync task and permits retry', async () => {
    const native = nativeRuntime();
    vi.stubGlobal('tjs', native);
    const app = await onTxiki(createApp([http({ controllers: [EchoController] }), httpServer()]));
    await app.httpServer.listen(app.http);
    const tasks = await app.get(TaskService);
    let finish!: () => void;
    const completion = tasks.runAndWait(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    await expect(app.shutdown()).rejects.toThrow('Cannot wait for active tasks');
    expect(native.serve.mock.results[0]?.value.close).not.toHaveBeenCalled();
    expect(native.removeSignalListener).not.toHaveBeenCalled();
    expect((await app.http.request('/echo?id=retry')).status).toBe(200);
    expect(await app.get(TaskService)).toBe(tasks);
    finish();
    await completion;
    await Promise.all([app.shutdown(), app.shutdown()]);
    expect(native.serve.mock.results[0]?.value.close).toHaveBeenCalledTimes(1);
    expect(native.removeSignalListener).toHaveBeenCalledTimes(2);
  });

  it('retains signals when a task starts during cleanup and shutdown is refused', async () => {
    const native = nativeRuntime();
    vi.stubGlobal('tjs', native);
    const app = await onTxiki(createApp([]));
    const tasks = await app.get(TaskService);
    const shutdown = await app.get(RuntimeShutdownService);
    const gate = Promise.withResolvers<void>();
    let completion: Promise<void> | undefined;
    app.registerShutdown(() => {
      completion = tasks.runAndWait(() => gate.promise);
    });
    try {
      await expect(app.shutdown()).rejects.toThrow('Runtime shutdown encountered errors');
      expect(shutdown.state).toBe('ready');
      expect([...native.listeners.keys()]).toEqual(['SIGINT', 'SIGTERM']);
      expect(native.removeSignalListener).not.toHaveBeenCalled();
      expect(native.exit).not.toHaveBeenCalled();
      gate.resolve();
      await completion;
      const handler = native.listeners.get('SIGTERM');
      if (!handler) throw new Error('adapter did not retain the signal handler');
      handler();
      await app.shutdown();
    } finally {
      gate.resolve();
      await completion;
      await app.shutdown();
    }
    expect(native.listeners.size).toBe(0);
    expect(native.removeSignalListener).toHaveBeenCalledTimes(2);
    expect(native.exit).not.toHaveBeenCalled();
  });

  it.each([
    'SIGINT',
    'SIGTERM',
  ] as const)('retains %s during lifecycle cleanup and shares repeated signals', async (signal) => {
    const native = nativeRuntime();
    vi.stubGlobal('tjs', native);
    const app = await onTxiki(createApp([]));
    const lifecycle = await app.get(LifecycleManager);
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const cleanup = vi.fn(async () => {
      started.resolve();
      await gate.promise;
    });
    lifecycle.register({ startup: () => {}, shutdown: cleanup });
    await lifecycle.startupPending();
    const handler = native.listeners.get(signal);
    if (!handler) throw new Error('adapter did not attach a signal handler');
    handler();
    const stopping = app.shutdown();
    try {
      await started.promise;
      expect(native.listeners.get(signal)).toBe(handler);
      expect(native.removeSignalListener).not.toHaveBeenCalled();
      handler();
      expect(app.shutdown()).toBe(stopping);
    } finally {
      gate.resolve();
      await stopping;
    }
    expect(cleanup).toHaveBeenCalledOnce();
    expect(native.listeners.size).toBe(0);
    expect(native.removeSignalListener).toHaveBeenCalledTimes(2);
    expect(native.exit).not.toHaveBeenCalled();
  });

  it('keeps native serving per HTTP feature and closes servers only once', async () => {
    const native = nativeRuntime();
    vi.stubGlobal('tjs', native);
    const app = await onTxiki(
      createApp([
        http({ controllers: [EchoController] }),
        httpServer(),
        http({ name: 'admin', controllers: [EchoController] }),
      ]),
    );
    const first = await app.httpServer.listen(app.http, { port: 0 });
    const second = await app.httpServer.listen(app.admin, { port: 41000, hostname: '0.0.0.0' });
    expect(first.address).toEqual({ port: 42001, address: '127.0.0.1' });
    expect(native.serve.mock.calls[1]).toEqual([
      { fetch: expect.any(Function), port: 41000, listenIp: '0.0.0.0' },
    ]);
    const env = await app.get(Env);
    expect(env.getRequired('ZELT_TEST')).toBe('txiki');
    await first.shutdown();
    await Promise.all([app.shutdown(), app.shutdown()]);
    await second.shutdown();
    for (const server of native.serve.mock.results)
      expect(server.value.close).toHaveBeenCalledTimes(1);
    expect(native.removeSignalListener).toHaveBeenCalledTimes(2);
    expect(() => app.httpServer.listen(app.http)).toThrow();
    expect(native.serve).toHaveBeenCalledTimes(2);
  });

  it('uses sync context even when Node has enabled ALS and isolates concurrent requests', async () => {
    vi.stubGlobal('tjs', nativeRuntime());
    const app = await onTxiki(createApp([http({ controllers: [EchoController] }), httpServer()]), {
      signals: false,
    });
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, id) => app.http.request(`/echo?id=${id}`)),
    );
    for (const [id, response] of responses.entries()) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: String(id), mode: 'sync' });
    }
    await app.shutdown();
  });

  it('cleans up initialized resources if native signal setup fails', async () => {
    const cleanup = vi.fn(async () => {});
    class ResourceFeature extends Feature<'resource', object> {
      readonly key = 'resource';
      featureClasses() {
        return [];
      }
      blueprint() {
        return {};
      }
      realize(resolver: { registerShutdown(callback: () => Promise<void>): unknown }) {
        resolver.registerShutdown(cleanup);
        return {};
      }
    }
    const native = nativeRuntime();
    native.addSignalListener.mockImplementation(() => {
      throw new Error('signal registration failed');
    });
    vi.stubGlobal('tjs', native);
    await expect(onTxiki(createApp([new ResourceFeature()]))).rejects.toThrow(
      'signal registration failed',
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(native.removeSignalListener).toHaveBeenCalledTimes(2);
  });
});
