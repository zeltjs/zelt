import {
  Controller,
  captureContext,
  createApp,
  Env,
  Feature,
  Get,
  http,
  request,
  TaskService,
} from '@zeltjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onTxiki } from './on-txiki';

@Controller('/echo')
class EchoController {
  @Get('/')
  async echo(req = request()) {
    const mode = captureContext().mode;
    await Promise.resolve();
    return { id: req.queryParam('id'), mode };
  }
}

const nativeRuntime = () => ({
  env: { ZELT_TEST: 'txiki' },
  addSignalListener: vi.fn(),
  removeSignalListener: vi.fn(),
  exit: vi.fn(),
  serve: vi.fn(() => ({ port: 42001, close: vi.fn(async () => {}) })),
});

afterEach(() => vi.unstubAllGlobals());

describe('onTxiki', () => {
  it('preserves serving after shutdown rejects an active sync task and permits retry', async () => {
    const native = nativeRuntime();
    vi.stubGlobal('tjs', native);
    const app = await onTxiki(createApp([http({ controllers: [EchoController] })]));
    app.http.serve();
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

  it('keeps native serving per HTTP feature and closes servers only once', async () => {
    const native = nativeRuntime();
    vi.stubGlobal('tjs', native);
    const app = await onTxiki(
      createApp([
        http({ controllers: [EchoController] }),
        http({ name: 'admin', controllers: [EchoController] }),
      ]),
    );
    const first = app.http.serve({ port: 0 });
    const second = app.admin.serve({ port: 41000, hostname: '0.0.0.0' });
    expect(first.address).toEqual({ port: 42001, hostname: '127.0.0.1' });
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
    expect(() => app.http.serve()).toThrow();
    expect(native.serve).toHaveBeenCalledTimes(2);
  });

  it('uses sync context even when Node has enabled ALS and isolates concurrent requests', async () => {
    vi.stubGlobal('tjs', nativeRuntime());
    const app = await onTxiki(createApp([http({ controllers: [EchoController] })]), {
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
