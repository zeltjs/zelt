import { Container } from '@needle-di/core';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createApp } from '../../app';
import { HttpFeature, http } from './http.feature';
import { Controller } from './routing/controller.decorator';
import { Get } from './routing/http-method.decorator';

const createRuntime = (container: Container) => ({
  get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => container.get(cls),
});

@Controller('/')
class TestController {
  @Get('/')
  index() {
    return { ok: true };
  }
}

describe('http feature', () => {
  it('http() returns HttpFeature instance', () => {
    const feature = http({ controllers: [TestController] });

    expect(feature).toBeInstanceOf(HttpFeature);
    expect(feature.key).toBe('http');
  });

  it('infers unnamed http() as the default http namespace', () => {
    expectTypeOf(http({ controllers: [TestController] })).toEqualTypeOf<HttpFeature<'http'>>();
  });

  it('uses the provided name as the feature namespace', () => {
    const feature = http({ name: 'private' as const, controllers: [TestController] });

    expect(feature.key).toBe('private');
    expectTypeOf(feature).toEqualTypeOf<HttpFeature<'private'>>();
  });

  it('keeps feature methods callable when destructured', () => {
    const feature = http({ controllers: [TestController] });
    const { blueprint } = feature;

    expect(blueprint().getControllers()).toEqual([TestController]);
  });

  it('createApp([http(...)]) exposes http capabilities in types', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    expectTypeOf(readyApp.http.fetch).toEqualTypeOf<(request: Request) => Promise<Response>>();

    await readyApp.shutdown();
  });

  it('returns HttpFeature entries by feature class', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    expect(readyApp.hasFeature(HttpFeature)).toBe(true);

    const entries = readyApp.getFeatureEntries(HttpFeature);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.key).toBe('http');
    expectTypeOf(entries[0]?.capabilities.fetch).toEqualTypeOf<
      ((request: Request) => Promise<Response>) | undefined
    >();

    await readyApp.shutdown();
  });

  it('supports multiple HttpFeature instances with distinct namespaces', async () => {
    @Controller('/')
    class PublicController {
      @Get('/public')
      getPublic() {
        return { scope: 'public' };
      }
    }

    @Controller('/')
    class PrivateController {
      @Get('/private')
      getPrivate() {
        return { scope: 'private' };
      }
    }

    const app = createApp([
      http({ controllers: [PublicController] }),
      http({ name: 'private' as const, controllers: [PrivateController] }),
    ]);
    const readyApp = await app.createRuntime();

    expectTypeOf(readyApp.http.fetch).toEqualTypeOf<(request: Request) => Promise<Response>>();
    expectTypeOf(readyApp.private.fetch).toEqualTypeOf<(request: Request) => Promise<Response>>();
    expect(readyApp.getFeatureEntries(HttpFeature).map((entry) => entry.key)).toEqual([
      'http',
      'private',
    ]);

    expect((await readyApp.http.request('/public')).status).toBe(200);
    expect((await readyApp.http.request('/private')).status).toBe(404);
    expect((await readyApp.private.request('/private')).status).toBe(200);
    expect((await readyApp.private.request('/public')).status).toBe(404);

    await readyApp.shutdown();
  });

  it('waits for every registered shutdown callback before reporting failures', async () => {
    const feature = http({ controllers: [] });
    const delayedShutdown = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

    feature.registerShutdown(() => {
      throw new Error('shutdown failed');
    });
    feature.registerShutdown(delayedShutdown);

    await expect(feature.shutdown()).rejects.toThrow(AggregateError);
    expect(delayedShutdown).toHaveResolved();
  });

  it('rejects duplicate resolved HTTP namespaces', () => {
    expect(() => createApp([http({ controllers: [] }), http({ controllers: [] })])).toThrow(
      /Duplicate feature namespace: http/,
    );
  });

  it('returns a ConfiguredFeature with key "http"', () => {
    const feature = http({ controllers: [TestController] });
    expect(feature.key).toBe('http');
    expect(feature.featureClasses()).toEqual([TestController]);
    expect(typeof feature.realize).toBe('function');
    expect(typeof feature.blueprint).toBe('function');
  });

  it('blueprint returns getControllers and getMetadata', () => {
    const feature = http({ controllers: [TestController] });
    const caps = feature.blueprint();
    expect(typeof caps.getControllers).toBe('function');
    expect(typeof caps.getMetadata).toBe('function');
    expect(caps.getControllers()).toEqual([TestController]);
  });

  it('composes static controller metadata from nested http modules', () => {
    @Controller('/')
    class ApiController {
      @Get('/health')
      health(): Response {
        return Response.json({ ok: true });
      }
    }

    const app = createApp([
      http({
        path: '/api',
        children: [
          http({
            path: '/v1',
            controllers: [ApiController],
          }),
        ],
      }),
    ]);

    expect(
      app.http.getMetadata().controllers.map((controller) => controller.routes[0]?.fullPath),
    ).toEqual(['/api/v1/health']);
  });

  it('realize returns fetch and request', async () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));
    expect(typeof caps.fetch).toBe('function');
    expect(typeof caps.request).toBe('function');
  });

  it('caps.request handles HTTP requests', async () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const res = await caps.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('mounts nested http feature modules through the same lifecycle', async () => {
    @Controller('/')
    class ApiController {
      @Get('/health')
      health(): Response {
        return Response.json({ ok: true });
      }
    }

    const app = createApp([
      http({
        path: '/api',
        children: [
          http({
            path: '/v1',
            controllers: [ApiController],
          }),
        ],
      }),
    ]);

    const runtime = await app.createRuntime();
    const response = await runtime.http.request('/api/v1/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
