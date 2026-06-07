import { Container } from '@needle-di/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

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

  it('infers http() as HttpFeature', () => {
    expectTypeOf(http({ controllers: [TestController] })).toEqualTypeOf<HttpFeature>();
  });

  it('keeps feature methods callable when destructured', () => {
    const feature = http({ controllers: [TestController] });
    const { staticCapabilities } = feature;

    expect(staticCapabilities().getControllers()).toEqual([TestController]);
  });

  it('createApp([http(...)]) exposes http capabilities in types', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    expectTypeOf(readyApp.http.fetch).toEqualTypeOf<(request: Request) => Promise<Response>>();

    await readyApp.shutdown();
  });

  it('hasFeature narrows RuntimeApp by HttpFeature', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    expect(readyApp.hasFeature(HttpFeature)).toBe(true);

    const caps = readyApp.getFeatureCapabilities(HttpFeature);
    expect(caps).toBeDefined();
    expectTypeOf(caps?.fetch).toEqualTypeOf<
      ((request: Request) => Promise<Response>) | undefined
    >();

    await readyApp.shutdown();
  });

  it('returns a ConfiguredFeature with key "http"', () => {
    const feature = http({ controllers: [TestController] });
    expect(feature.key).toBe('http');
    expect(typeof feature.createCapabilities).toBe('function');
    expect(typeof feature.staticCapabilities).toBe('function');
  });

  it('staticCapabilities returns getControllers and getMetadata', () => {
    const feature = http({ controllers: [TestController] });
    const caps = feature.staticCapabilities();
    expect(typeof caps.getControllers).toBe('function');
    expect(typeof caps.getMetadata).toBe('function');
    expect(caps.getControllers()).toEqual([TestController]);
  });

  it('createCapabilities returns fetch and request', async () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    const caps = await feature.createCapabilities(createRuntime(container));
    expect(typeof caps.fetch).toBe('function');
    expect(typeof caps.request).toBe('function');
  });

  it('caps.request handles HTTP requests', async () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    const caps = await feature.createCapabilities(createRuntime(container));

    const res = await caps.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
