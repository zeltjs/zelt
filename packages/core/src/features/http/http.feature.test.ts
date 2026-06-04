import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { LifecycleManager } from '../../kernel';
import { http } from './http.feature';
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
  it('returns a ConfiguredFeature with key "http"', () => {
    const feature = http({ controllers: [TestController] });
    expect(feature.key).toBe('http');
    expect(typeof feature.bind).toBe('function');
    expect(typeof feature.createCapabilities).toBe('function');
  });

  it('createCapabilities returns HttpCapabilities', async () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    feature.bind(container);
    const caps = await feature.createCapabilities(createRuntime(container));
    expect(typeof caps.fetch).toBe('function');
    expect(typeof caps.request).toBe('function');
    expect(typeof caps.getControllers).toBe('function');
    expect(typeof caps.getMetadata).toBe('function');
  });

  it('caps.request handles HTTP requests', async () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    feature.bind(container);
    const caps = await feature.createCapabilities(createRuntime(container));

    const lifecycle = container.get(LifecycleManager);
    await lifecycle.startup();

    const res = await caps.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    await lifecycle.shutdown();
  });
});
