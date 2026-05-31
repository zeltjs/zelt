import type { App, HttpModule, Next, RequestContext } from '@zeltjs/core';
import {
  Controller,
  createApp,
  Get,
  Middleware,
  Post,
  SkipMiddleware,
  UseMiddleware,
} from '@zeltjs/core';
import type { TestableApp } from '@zeltjs/testing';
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
  @Get('/wildcard/*')
  wildcard() {
    return RETURN_VALUE;
  }

  @SkipMiddleware(GlobalMiddleware)
  @Get('/multiple/exclude')
  multipleExclude() {
    return RETURN_VALUE;
  }
}

describe('Exclude middleware (@SkipMiddleware)', () => {
  let testApp: TestableApp<App<[HttpModule]>>;

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

  it('should exclude wildcard route "/wildcard/*"', async () => {
    await setup();
    const res = await testApp.request('/wildcard/anything');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe(RETURN_VALUE);
  });

  it('should exclude wildcard route at nested path "/wildcard/deep/path"', async () => {
    await setup();
    const res = await testApp.request('/wildcard/deep/path');
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
