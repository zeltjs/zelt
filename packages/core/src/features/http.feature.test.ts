import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { LifecycleManager } from '../kernel';
import { Controller } from '../modules/http/routing/controller.decorator';
import { Get } from '../modules/http/routing/http-method.decorator';
import { http } from './http.feature';

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
    expect(typeof feature.resolve).toBe('function');
  });

  it('resolve returns HttpCapabilities', () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    feature.bind(container);
    const caps = feature.resolve(container);
    expect(typeof caps.fetch).toBe('function');
    expect(typeof caps.request).toBe('function');
    expect(typeof caps.getControllers).toBe('function');
    expect(typeof caps.getMetadata).toBe('function');
  });

  it('caps.request handles HTTP requests', async () => {
    const feature = http({ controllers: [TestController] });
    const container = new Container();
    feature.bind(container);
    const caps = feature.resolve(container);

    const lifecycle = container.get(LifecycleManager);
    await lifecycle.warmup();
    await lifecycle.startup();

    const res = await caps.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    await lifecycle.shutdown();
  });
});
