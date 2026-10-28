import type { ReservedAppKey } from '@zeltjs/core';
import {
  Config,
  Controller,
  createApp,
  Get,
  http,
  Injectable,
  inject,
  injectFeature,
  LifecycleManager,
  Post,
  RuntimeShutdownService,
  request,
  response,
  TaskService,
  ZeltLifecycleStateError,
} from '@zeltjs/core';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { onTinyjs } from './on-tinyjs';
import { createTinyFetch } from './renderer';
import type { TinyjsNativeApp } from './shared/bridge.types';
import { TinyjsAppAdaptor } from './tinyjs-app.adaptor';
import { TinyjsBridgeFeature, tinyjsBridge } from './tinyjs-bridge.feature';
import type { TinyjsBridge } from './tinyjs-bridge.types';

const assertReservedNames = (name: ReservedAppKey, mixed: 'desktop' | 'shutdown'): void => {
  // @ts-expect-error bridge feature names exclude reserved app keys
  tinyjsBridge({ name });
  // @ts-expect-error literal reserved names must not widen during inference
  tinyjsBridge({ name: 'shutdown' });
  // @ts-expect-error unions containing reserved names are also rejected
  tinyjsBridge({ name: mixed });
  expectTypeOf(tinyjsBridge({ name: 'api' }).key).toEqualTypeOf<'api'>();
  expectTypeOf(tinyjsBridge({ name: 'init' }).key).toEqualTypeOf<'init'>();
};
void assertReservedNames;

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
    return response()
      .header('Content-Type', 'application/octet-stream')
      .body(new Uint8Array([0, 127, 128, 255]));
  }

  @Post('/binary')
  async binaryEcho(req = request()) {
    return response()
      .header('Content-Type', 'text/plain;charset=UTF-8')
      .body(await req.bodyRaw());
  }

  @Get('/empty')
  empty() {
    return response().status(204).empty();
  }

  @Get('/error')
  error() {
    return response().json({ reason: 'invalid' }, 422);
  }
}

afterEach(() => vi.unstubAllGlobals());

const stubEnvironment = () => vi.stubGlobal('tjs', { env: {} });

describe('tinyjs Fetch bridge', () => {
  it('preserves the supplied native type and identity through feature injection and lifecycle', async () => {
    stubEnvironment();
    type UserNativeApp = {
      done: Promise<void>;
      version: '0.60.0';
      readonly openWindow: (path: string) => URL;
    };
    @Config
    class DesktopAdaptor extends TinyjsAppAdaptor<UserNativeApp> {}
    const definition = tinyjsBridge({ name: 'desktop', adaptor: DesktopAdaptor });
    @Injectable()
    class NativeConsumer {
      readonly adaptor = inject(DesktopAdaptor);
      readonly bridge = injectFeature(definition);
    }
    const app = await onTinyjs(createApp([definition]));
    const consumer = await app.get(NativeConsumer);
    const native: UserNativeApp = {
      done: new Promise<void>(() => {}),
      version: '0.60.0',
      openWindow: (path) => new URL(path, 'https://desktop.example'),
    };
    try {
      expectTypeOf<typeof consumer.adaptor.native>().toEqualTypeOf<UserNativeApp>();
      expectTypeOf(tinyjsBridge({ adaptor: DesktopAdaptor }).key).toEqualTypeOf<'tinyjsBridge'>();
      const bridge = app.desktop.create({ fetch: async () => new Response() });
      expectTypeOf(bridge).toEqualTypeOf<TinyjsBridge<UserNativeApp>>();
      expectTypeOf(bridge.init).parameter(0).toEqualTypeOf<UserNativeApp>();
      const assertNativeContract = (minimal: TinyjsNativeApp, reserved: ReservedAppKey): void => {
        // @ts-expect-error a typed bridge requires the complete user native contract
        bridge.init(minimal);
        // @ts-expect-error custom adaptors must not allow reserved feature names
        tinyjsBridge({ name: reserved, adaptor: DesktopAdaptor });
        // @ts-expect-error native app types must provide the completion promise
        expectTypeOf<TinyjsAppAdaptor<{ version: string }>>();
      };
      void assertNativeContract;
      expect(consumer.bridge).toBe(app.desktop);
      expect(() => consumer.adaptor.native).toThrow(ZeltLifecycleStateError);
      bridge.init(native);
      expect(consumer.adaptor.native).toBe(native);
      expect(consumer.adaptor.native.openWindow('/settings').pathname).toBe('/settings');
      expect(() => bridge.init(native)).toThrow(ZeltLifecycleStateError);
    } finally {
      await app.shutdown();
    }
    expect(() => consumer.adaptor.native).toThrow(ZeltLifecycleStateError);
  });

  it('only requires native completion for the default bridge', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([tinyjsBridge()]));
    try {
      const native = { done: new Promise<void>(() => {}) };
      app.tinyjsBridge.create({ fetch: async () => new Response() }).init(native);
      expect((await app.get(TinyjsAppAdaptor)).native).toBe(native);
    } finally {
      await app.shutdown();
    }
  });

  it('uses an explicitly supplied HTTP target without a default HTTP feature', async () => {
    stubEnvironment();
    const app = await onTinyjs(
      createApp([
        http({ name: 'backend', controllers: [ApiController] }),
        tinyjsBridge({ name: 'desktop' }),
      ]),
    );
    try {
      const nativeBridge = app.desktop.create(app.backend);
      expectTypeOf(nativeBridge).toEqualTypeOf<TinyjsBridge>();
      expectTypeOf(app).not.toHaveProperty('api');
      expectTypeOf(app).not.toHaveProperty('init');
      const fetch = createTinyFetch({
        bridge: { call: async (_method, payload) => nativeBridge.api['zelt.fetch'](payload) },
      });
      expect(await (await fetch('/api/count')).json()).toEqual({ count: 1 });
      expect(app.getFeatureEntries(TinyjsBridgeFeature)[0]?.capabilities).toBe(app.desktop);
    } finally {
      await app.shutdown();
    }
  });

  it('shares the declared bridge capability with feature injection', async () => {
    stubEnvironment();
    const definition = tinyjsBridge();
    @Injectable()
    class BridgeConsumer {
      readonly bridge = injectFeature(definition);
      readonly defaultBridge = injectFeature(TinyjsBridgeFeature);
    }
    const app = await onTinyjs(createApp([definition]));
    try {
      expect((await app.get(BridgeConsumer)).bridge).toBe(app.tinyjsBridge);
      expect((await app.get(BridgeConsumer)).defaultBridge).toBe(app.tinyjsBridge);
      expectTypeOf(definition.key).toEqualTypeOf<'tinyjsBridge'>();
      expect(app).not.toHaveProperty('bridge');
    } finally {
      await app.shutdown();
    }
  });

  it('accepts a Fetch-shaped target and a matching renderer origin', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([tinyjsBridge()]));
    try {
      const nativeBridge = app.tinyjsBridge.create(
        {
          fetch: async (request) => new Response(request.url, { status: 201 }),
        },
        { origin: 'https://desktop.example' },
      );
      const fetch = createTinyFetch({
        origin: 'https://desktop.example',
        bridge: { call: async (_method, payload) => nativeBridge.api['zelt.fetch'](payload) },
      });
      const response = await fetch('/explicit?q=1');
      expect(response.status).toBe(201);
      expect(await response.text()).toBe('https://desktop.example/explicit?q=1');
      expect(() =>
        app.tinyjsBridge.create({ fetch: async () => new Response() }, { origin: 'invalid' }),
      ).toThrow(TypeError);
    } finally {
      await app.shutdown();
    }
  });

  it('supports a named target called fetch without confusing it with the Fetch method', async () => {
    stubEnvironment();
    const app = await onTinyjs(
      createApp([http({ name: 'fetch', controllers: [ApiController] }), tinyjsBridge()]),
    );
    try {
      const nativeBridge = app.tinyjsBridge.create(new Map([['fetch', app.fetch]]));
      const fetch = createTinyFetch({
        feature: 'fetch',
        bridge: { call: async (_method, payload) => nativeBridge.api['zelt.fetch'](payload) },
      });
      expect(await (await fetch('/api/count')).json()).toEqual({ count: 1 });
    } finally {
      await app.shutdown();
    }
  });

  it('rejects generated bridge operations while common shutdown is pending', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
    const nativeBridge = app.tinyjsBridge.create(app.http);
    const native = {
      done: new Promise(() => {}),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    let finish!: () => void;
    app.registerShutdown(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const stopping = app.shutdown();
    expect(() => nativeBridge.init(native)).toThrow(ZeltLifecycleStateError);
    expect(() => app.tinyjsBridge.create(app.http)).toThrow(ZeltLifecycleStateError);
    await expect(nativeBridge.api['zelt.fetch']({})).rejects.toThrow(ZeltLifecycleStateError);
    finish();
    await stopping;
    expect(() => nativeBridge.init(native)).toThrow(ZeltLifecycleStateError);
  });

  it('keeps bridge state and native lifetimes isolated between runtimes', async () => {
    stubEnvironment();
    const definition = createApp([http({ controllers: [ApiController] }), tinyjsBridge()]);
    const first = await onTinyjs(definition);
    const second = await onTinyjs(definition);
    const firstBridge = first.tinyjsBridge.create(first.http);
    const secondBridge = second.tinyjsBridge.create(second.http);
    try {
      await first.shutdown();
      await expect(firstBridge.api['zelt.fetch']({})).rejects.toThrow(ZeltLifecycleStateError);
      const fetch = createTinyFetch({
        bridge: { call: async (_method, payload) => secondBridge.api['zelt.fetch'](payload) },
      });
      expect(await (await fetch('/api/count')).json()).toEqual({ count: 1 });
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
    }
  });

  it('propagates native completion errors after running runtime cleanup', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([tinyjsBridge()]));
    const nativeBridge = app.tinyjsBridge.create({ fetch: async () => new Response() });
    const failure = new Error('native completion failed');
    const native = {
      done: Promise.reject(failure),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    const cleanup = vi.fn();
    app.registerShutdown(cleanup);
    nativeBridge.init(native);
    await expect(native.done).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledOnce();
    await app.shutdown();
  });

  it('keeps IPC and native app available after a refused shutdown and permits retry', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
    expect(app.shutdown).toBe((await app.get(RuntimeShutdownService)).shutdown);
    const nativeBridge = app.tinyjsBridge.create(app.http);
    const native = {
      done: new Promise<void>(() => {}),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    nativeBridge.init(native);
    const adaptor = await app.get(TinyjsAppAdaptor);
    const tasks = await app.get(TaskService);
    const fetch = createTinyFetch({
      bridge: { call: async (_method, payload) => nativeBridge.api['zelt.fetch'](payload) },
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
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
    const nativeBridge = app.tinyjsBridge.create(app.http);
    const native = {
      done: new Promise<void>(() => {}),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    nativeBridge.init(native);
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
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
    const nativeBridge = app.tinyjsBridge.create(app.http);
    const native = {
      done: new Promise<void>(() => {}),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    nativeBridge.init(native);
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
    await expect(nativeBridge.api['zelt.fetch']({})).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('round trips HTTP semantics and JSON-serializable binary bodies without a TCP listener', async () => {
    stubEnvironment();
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
    const nativeBridge = app.tinyjsBridge.create(app.http);
    const fetch = createTinyFetch({
      bridge: {
        call: async (method, payload) => {
          expect(method).toBe('zelt.fetch');
          return JSON.parse(
            JSON.stringify(
              await nativeBridge.api['zelt.fetch'](JSON.parse(JSON.stringify(payload))),
            ),
          );
        },
      },
    });
    const binary = await fetch('/api/binary');
    expect(binary.url).toBe('http://zelt-tinyjs/api/binary');
    const cloned = binary.clone();
    expect(cloned).toBeInstanceOf(Response);
    expect(cloned.url).toBe(binary.url);
    expect([...new Uint8Array(await cloned.arrayBuffer())]).toEqual([0, 127, 128, 255]);
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
        tinyjsBridge(),
      ]),
    );
    const nativeBridge = app.tinyjsBridge.create(
      new Map([
        ['http', app.http],
        ['admin', app.admin],
      ]),
    );
    const bridge = {
      call: async (_method: string, payload: unknown) => nativeBridge.api['zelt.fetch'](payload),
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
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
    const nativeBridge = app.tinyjsBridge.create(app.http);
    const bridge = {
      call: vi.fn(async (_method: string, payload: unknown) =>
        nativeBridge.api['zelt.fetch'](payload),
      ),
    };
    const fetch = createTinyFetch({ bridge });
    await expect(nativeBridge.api['zelt.fetch']({})).rejects.toThrow(
      'Invalid tinyjs Fetch request',
    );
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
    const native = {
      done: new Promise<void>((resolve) => {
        stopNative = resolve;
      }),
      setTitle: vi.fn(),
      push: vi.fn(),
      quit: vi.fn(),
    };
    const app = await onTinyjs(createApp([http({ controllers: [ApiController] }), tinyjsBridge()]));
    const nativeBridge = app.tinyjsBridge.create(app.http);
    const adaptor = await app.get(TinyjsAppAdaptor);
    expect(() => adaptor.native).toThrow(ZeltLifecycleStateError);
    const order: string[] = [];
    app.registerShutdown(async () => {
      await Promise.resolve();
      order.push('shutdown');
    });
    nativeBridge.init(native);
    expect(adaptor.native).toBe(native);
    expect(() => nativeBridge.init(native)).toThrow(ZeltLifecycleStateError);
    stopNative?.();
    await native.done;
    expect(order).toEqual(['shutdown']);
    expect(() => adaptor.native).toThrow(ZeltLifecycleStateError);
    await app.shutdown();
    expect(order).toEqual(['shutdown']);
    await expect(nativeBridge.api['zelt.fetch']({})).rejects.toThrow(ZeltLifecycleStateError);
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
});
