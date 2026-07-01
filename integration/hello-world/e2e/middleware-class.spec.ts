import type { Next } from '@zeltjs/core';
import { Controller, createApp, Get, http, Middleware, Post, UseMiddleware } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

const RETURN_VALUE = 'test';
const WILDCARD_VALUE = 'test_wildcard';
const INCLUDED_VALUE = 'test_included';

@Middleware
class WildcardMiddleware {
  async use(_next: Next) {
    return new Response(WILDCARD_VALUE);
  }
}

@Middleware
class GlobalWildcardMiddleware {
  use(): Response {
    return new Response(WILDCARD_VALUE);
  }
}

@Middleware
class IncludedPostMiddleware {
  use(): Response {
    return new Response(INCLUDED_VALUE, { status: 201 });
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
  afterEach(async () => {
    await shutdownAll();
  });

  it('class middleware applies to all controller routes', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const testApp = await onTest(app);

    const res = await testApp.http.request('/test');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(WILDCARD_VALUE);
  });

  it('global middleware applies to all routes', async () => {
    const app = createApp([
      http({
        controllers: [HelloController],
        middlewares: [GlobalWildcardMiddleware],
      }),
    ]);
    const testApp = await onTest(app);

    const res = await testApp.http.request('/hello');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(WILDCARD_VALUE);
  });

  it('global middleware applies to /test route', async () => {
    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [GlobalWildcardMiddleware],
      }),
    ]);
    const testApp = await onTest(app);

    const res = await testApp.http.request('/test');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(WILDCARD_VALUE);
  });

  it('method-specific middleware does not affect other methods', async () => {
    @Controller('/')
    class MethodSpecificController {
      @Get('/tests/included')
      get() {
        return RETURN_VALUE;
      }

      @UseMiddleware(IncludedPostMiddleware)
      @Post('/tests/included')
      post() {
        return RETURN_VALUE;
      }
    }

    const app = createApp([http({ controllers: [MethodSpecificController] })]);
    const testApp = await onTest(app);

    const getRes = await testApp.http.request('/tests/included');
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toBe(RETURN_VALUE);

    const postRes = await testApp.http.request('/tests/included', { method: 'POST' });
    expect(postRes.status).toBe(201);
    expect(await postRes.text()).toBe(INCLUDED_VALUE);
  });
});
