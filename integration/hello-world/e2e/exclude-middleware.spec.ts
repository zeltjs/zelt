import type { Next, RequestContext } from '@zeltjs/core';
import {
  Controller,
  createApp,
  Get,
  Middleware,
  Post,
  SkipMiddleware,
  UseMiddleware,
} from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

const RETURN_VALUE = 'test';
const MIDDLEWARE_VALUE = 'middleware';

@Middleware
class GlobalMiddleware {
  async use(c: RequestContext, _next: Next) {
    return c.text(MIDDLEWARE_VALUE);
  }
}

@UseMiddleware(GlobalMiddleware)
@Controller('/')
class TestController {
  @SkipMiddleware(GlobalMiddleware)
  @Get('/test')
  test() {
    return RETURN_VALUE;
  }

  @Get('/test2')
  test2() {
    return RETURN_VALUE;
  }

  @Get('/middleware')
  middleware() {
    return RETURN_VALUE;
  }

  @SkipMiddleware(GlobalMiddleware)
  @Post('/middleware')
  noMiddleware() {
    return RETURN_VALUE;
  }

  @SkipMiddleware(GlobalMiddleware)
  @Get('/overview/:id')
  overviewById() {
    return RETURN_VALUE;
  }

  @SkipMiddleware(GlobalMiddleware)
  @Get('/wildcard/overview')
  testOverview() {
    return RETURN_VALUE;
  }

  @SkipMiddleware(GlobalMiddleware)
  @Get('/legacy-wildcard/overview')
  legacyWildcard() {
    return RETURN_VALUE;
  }

  @SkipMiddleware(GlobalMiddleware)
  @Get('/splat-wildcard/overview')
  splatWildcard() {
    return RETURN_VALUE;
  }

  @SkipMiddleware(GlobalMiddleware)
  @Get('/multiple/exclude')
  multipleExclude() {
    return RETURN_VALUE;
  }
}

describe('Exclude middleware (@SkipMiddleware)', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  afterEach(async () => {
    await shutdownAll();
  });

  const setup = async () => {
    const app = createApp({
      http: { controllers: [TestController] },
    });
    testApp = await onTest(app);
  };

  it('should exclude "/test" endpoint', async () => {
    await setup();
    const res = await testApp.request('/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });

  it('should not exclude "/test2" endpoint', async () => {
    await setup();
    const res = await testApp.request('/test2');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(MIDDLEWARE_VALUE);
  });

  it('should run middleware for GET "/middleware" endpoint', async () => {
    await setup();
    const res = await testApp.request('/middleware');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(MIDDLEWARE_VALUE);
  });

  it('should exclude POST "/middleware" endpoint', async () => {
    await setup();
    const res = await testApp.request('/middleware', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });

  it('should exclude "/overview/:id" endpoint (by param)', async () => {
    await setup();
    const res = await testApp.request('/overview/1');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });

  it('should exclude "/wildcard/overview" endpoint (by wildcard)', async () => {
    await setup();
    const res = await testApp.request('/wildcard/overview');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });

  it('should exclude "/legacy-wildcard/overview" endpoint (by wildcard, legacy syntax)', async () => {
    await setup();
    const res = await testApp.request('/legacy-wildcard/overview');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });

  it('should exclude "/splat-wildcard/overview" endpoint (by wildcard, new syntax)', async () => {
    await setup();
    const res = await testApp.request('/splat-wildcard/overview');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });

  it('should exclude "/multiple/exclude" endpoint', async () => {
    await setup();
    const res = await testApp.request('/multiple/exclude');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });
});
