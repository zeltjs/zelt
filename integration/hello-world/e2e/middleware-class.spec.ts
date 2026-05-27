import type { Next } from '@zeltjs/core';
import {
  Controller,
  createApp,
  fromHonoMiddleware,
  Get,
  Middleware,
  Post,
  requestContext,
  UseMiddleware,
} from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

const RETURN_VALUE = 'test';
const WILDCARD_VALUE = 'test_wildcard';
const INCLUDED_VALUE = 'test_included';

@Middleware
class WildcardMiddleware {
  async use(_next: Next) {
    const c = requestContext();
    return c.text(WILDCARD_VALUE);
  }
}

@Controller('/hello')
class HelloController {
  @Get('/')
  hello() {
    return RETURN_VALUE;
  }
}

@UseMiddleware(WildcardMiddleware)
@Controller('/')
class TestController {
  @Get('/test')
  test() {
    return RETURN_VALUE;
  }

  @Get('/tests/included')
  testsIncludedGet() {
    return RETURN_VALUE;
  }

  @Post('/tests/included')
  testsIncludedPost() {
    return INCLUDED_VALUE;
  }
}

describe('Middleware (class)', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  afterEach(async () => {
    await shutdownAll();
  });

  it('class middleware applies to all controller routes', async () => {
    const app = createApp({
      http: { controllers: [TestController] },
    });
    testApp = await onTest(app);

    const res = await testApp.request('/test');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(WILDCARD_VALUE);
  });

  it('global function middleware applies to all routes', async () => {
    const GlobalMiddleware = fromHonoMiddleware(async (c, _next) => {
      return c.text(WILDCARD_VALUE);
    });

    const app = createApp({
      http: {
        controllers: [HelloController],
        middlewares: [GlobalMiddleware],
      },
    });
    testApp = await onTest(app);

    const res = await testApp.request('/hello');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(WILDCARD_VALUE);
  });

  it('global middleware applies to /test route', async () => {
    const GlobalMiddleware = fromHonoMiddleware(async (c, _next) => {
      return c.text(WILDCARD_VALUE);
    });

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [GlobalMiddleware],
      },
    });
    testApp = await onTest(app);

    const res = await testApp.request('/test');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(WILDCARD_VALUE);
  });

  it('method-specific middleware does not affect other methods', async () => {
    const MethodMiddleware = fromHonoMiddleware(async (c, _next) => c.text(INCLUDED_VALUE, 201));

    @Controller('/')
    class MethodSpecificController {
      @Get('/tests/included')
      get() {
        return RETURN_VALUE;
      }

      @UseMiddleware(MethodMiddleware)
      @Post('/tests/included')
      post() {
        return RETURN_VALUE;
      }
    }

    const app = createApp({
      http: { controllers: [MethodSpecificController] },
    });
    testApp = await onTest(app);

    const getRes = await testApp.request('/tests/included');
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toBe(RETURN_VALUE);

    const postRes = await testApp.request('/tests/included', { method: 'POST' });
    expect(postRes.status).toBe(201);
    expect(await postRes.text()).toBe(INCLUDED_VALUE);
  });
});
