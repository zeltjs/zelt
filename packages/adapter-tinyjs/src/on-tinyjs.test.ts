import {
  Controller,
  createApp,
  Get,
  http,
  Injectable,
  inject,
  LifecycleManager,
  Post,
  request,
  response,
  TaskService,
  ZeltLifecycleStateError,
} from '@zeltjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onTinyjs } from './on-tinyjs';
import { createTinyFetch } from './renderer';
import type { TinyjsNativeApp } from './shared/bridge.types';
import { TinyjsAppAdaptor } from './tinyjs-app.adaptor';

@Injectable()
class CounterService {
  count = 0;
  increment() {
    return ++this.count;
  }
}

@Controller('/api')
class ApiController {
  constructor(private counter = inject(CounterService)) {}

  @Get('/count')
  count() {
    return { count: this.counter.increment() };
  }

  @Post('/echo')
  async echo(req = request()) {
    await Promise.resolve();
    return { id: req.queryParam('id'), body: await req.body() };
  }

  @Get('/binary')
  binary() {
    return new Response(new Uint8Array([0, 127, 128, 255]), {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }

  @Post('/binary')
  async binaryEcho(req = request()) {
    return new Response(await req.bodyRaw());
  }

  @Get('/empty')
  empty() {
    return new Response(null, { status: 204 });
  }

  @Get('/error')
  error() {
    return response().json({ reason: 'invalid' }, 422);
  }
}

afterEach(() => vi.unstubAllGlobals());

const stubEnvironment = () => vi.stubGlobal('tjs', { env: {} });

describe('tinyjs Fetch bridge', () => {
  it('keeps IPC and native app available after a refused shutdown and permits retry', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] })]));
    const native: TinyjsNativeApp = {
      done: new Promise<void>(() => {}),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    app.init(native);
    const adaptor = await app.get(TinyjsAppAdaptor);
    const tasks = await app.get(TaskService);
    const fetch = createTinyFetch({
      bridge: { call: async (_method, payload) => app.api['zelt.fetch'](payload) },
    });
    let finish!: () => void;
    const completion = tasks.runAndWait(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    await expect(app.shutdown()).rejects.toThrow('Cannot wait for active tasks');
    expect(adaptor.native).toBe(native);
    expect(await (await fetch('/api/count')).json()).toEqual({ count: 1 });
    finish();
    await completion;
    await Promise.all([app.shutdown(), app.shutdown()]);
    expect(() => adaptor.native).toThrow(ZeltLifecycleStateError);
    await expect(fetch('/api/count')).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('retains native state when a task starts during a shutdown callback', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] })]));
    const native: TinyjsNativeApp = {
      done: new Promise<void>(() => {}),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    app.init(native);
    const adaptor = await app.get(TinyjsAppAdaptor);
    const tasks = await app.get(TaskService);
    let finish!: () => void;
    let completion: Promise<void> | undefined;
    const cleanup = vi.fn(() => {
      completion = tasks.runAndWait(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
    });
    app.registerShutdown(cleanup);
    await expect(app.shutdown()).rejects.toThrow('Runtime shutdown encountered errors');
    expect(adaptor.native).toBe(native);
    finish();
    await completion;
    await app.shutdown();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => adaptor.native).toThrow(ZeltLifecycleStateError);
  });

  it('disposes native state when actual lifecycle cleanup fails', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] })]));
    const native: TinyjsNativeApp = {
      done: new Promise<void>(() => {}),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    app.init(native);
    const adaptor = await app.get(TinyjsAppAdaptor);
    const lifecycle = await app.get(LifecycleManager);
    lifecycle.register({
      startup: () => {},
      shutdown: () => {
        throw new Error('cleanup failed');
      },
    });
    await lifecycle.startupPending();
    await expect(app.shutdown()).rejects.toThrow('Runtime shutdown encountered errors');
    expect(() => adaptor.native).toThrow(ZeltLifecycleStateError);
    await expect(app.api['zelt.fetch']({})).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('round trips HTTP semantics and JSON-serializable binary bodies without a TCP listener', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] })]));
    const fetch = createTinyFetch({
      bridge: {
        call: async (method, payload) => {
          expect(method).toBe('zelt.fetch');
          return JSON.parse(
            JSON.stringify(await app.api['zelt.fetch'](JSON.parse(JSON.stringify(payload)))),
          );
        },
      },
    });
    const binary = await fetch('/api/binary');
    expect(binary.url).toBe('http://zelt-tinyjs/api/binary');
    expect([...new Uint8Array(await binary.arrayBuffer())]).toEqual([0, 127, 128, 255]);
    expect((await fetch('/api/empty')).status).toBe(204);
    const error = await fetch('/api/error');
    expect(error.status).toBe(422);
    expect(error.ok).toBe(false);
    expect(await error.json()).toEqual({ reason: 'invalid' });
    expect((await fetch('/api/count', { method: 'HEAD' })).body).toBeNull();
    const requests = await Promise.all(
      Array.from({ length: 30 }, (_, id) =>
        fetch(`/api/echo?id=${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }),
      ),
    );
    for (const [id, result] of requests.entries())
      expect(await result.json()).toEqual({ id: String(id), body: { id } });
    await app.shutdown();
  });

  it('shares services across named features while restricting exposed routers', async () => {
    stubEnvironment();
    const app = await onTinyjs(
      createApp([
        http({ controllers: [ApiController] }),
        http({ name: 'admin', controllers: [ApiController] }),
        http({ name: 'private', controllers: [ApiController] }),
      ]),
      { bridgeFeatures: ['http', 'admin'] },
    );
    const bridge = {
      call: async (_method: string, payload: unknown) => app.api['zelt.fetch'](payload),
    };
    expect(await (await createTinyFetch({ bridge })('/api/count')).json()).toEqual({ count: 1 });
    expect(
      await (await createTinyFetch({ bridge, feature: 'admin' })('/api/count')).json(),
    ).toEqual({ count: 2 });
    await expect(createTinyFetch({ bridge, feature: 'private' })('/api/count')).rejects.toThrow(
      'not exposed',
    );
    await app.shutdown();
  });

  it('rejects malformed requests, unexpected origins, malformed responses, and pre-aborted fetches', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] })]));
    const bridge = {
      call: vi.fn(async (_method: string, payload: unknown) => app.api['zelt.fetch'](payload)),
    };
    const fetch = createTinyFetch({ bridge });
    await expect(app.api['zelt.fetch']({})).rejects.toThrow('Invalid tinyjs Fetch request');
    await expect(fetch('https://example.com/api')).rejects.toThrow('configured HTTP origin');
    await expect(fetch('//example.com/api')).rejects.toThrow('configured HTTP origin');
    await expect(fetch('/api/count', { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(bridge.call).not.toHaveBeenCalled();
    await expect(
      createTinyFetch({ bridge: { call: async () => ({ status: 0 }) } })('/api/count'),
    ).rejects.toThrow('Invalid tinyjs Fetch response');
    await app.shutdown();
  });

  it('awaits shutdown before native app.done resolves and disposes the native adaptor', async () => {
    stubEnvironment();
    let stopNative: (() => void) | undefined;
    const native: TinyjsNativeApp = {
      done: new Promise<void>((resolve) => {
        stopNative = resolve;
      }),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] })]));
    const adaptor = await app.get(TinyjsAppAdaptor);
    expect(() => adaptor.native).toThrow(ZeltLifecycleStateError);
    const order: string[] = [];
    app.registerShutdown(async () => {
      await Promise.resolve();
      order.push('shutdown');
    });
    app.init(native);
    expect(adaptor.native).toBe(native);
    expect(() => app.init(native)).toThrow(ZeltLifecycleStateError);
    stopNative?.();
    await native.done;
    expect(order).toEqual(['shutdown']);
    expect(() => adaptor.native).toThrow(ZeltLifecycleStateError);
    await app.shutdown();
    expect(order).toEqual(['shutdown']);
    await expect(app.api['zelt.fetch']({})).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('aborts renderer waiting while a dispatched native handler is still pending', async () => {
    const controller = new AbortController();
    let finish: ((value: unknown) => void) | undefined;
    const dispatched = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          finish = resolve;
        }),
    );
    const fetch = createTinyFetch({ bridge: { call: dispatched } });
    const result = fetch('/api/count', { signal: controller.signal });
    await Promise.resolve();
    expect(dispatched).toHaveBeenCalledTimes(1);
    controller.abort(new Error('cancelled'));
    await expect(result).rejects.toThrow('cancelled');
    finish?.({});
  });

  it('rejects names that collide with native exports before initializing', async () => {
    await expect(
      onTinyjs(createApp([http({ name: 'api', controllers: [ApiController] })])),
    ).rejects.toThrow('reserves the feature name');
  });
});
