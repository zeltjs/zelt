import type { FunctionMiddleware } from '@zeltjs/core';
import { createApp } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { WildcardController } from '../src/wildcard.controller';

describe('Middleware', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('controller-level middleware is executed', async () => {
    const res = await testApp.request('/middleware/with-logging');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Middleware-Executed')).toBe('true');
  });

  it('@SkipMiddleware excludes specific middleware', async () => {
    const res = await testApp.request('/middleware/skip-logging');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Middleware-Executed')).toBeNull();
  });

  it('middleware with options adds custom header', async () => {
    const res = await testApp.request('/middleware/with-header');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Custom')).toBe('test-value');
  });
});

describe('Middleware (global)', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  afterEach(async () => {
    await shutdownAll();
  });

  it('global middleware applies to all routes', async () => {
    const globalMiddleware: FunctionMiddleware = async (c, next) => {
      c.header('X-Global', 'applied');
      await next();
    };

    const app = createApp({
      http: {
        controllers: [WildcardController],
        middlewares: [globalMiddleware],
      },
    });
    testApp = await onTest(app);

    const res = await testApp.request('/tests/wildcard');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Global')).toBe('applied');
  });

  it('global middleware applies to nested routes', async () => {
    const globalMiddleware: FunctionMiddleware = async (c, next) => {
      c.header('X-Global', 'applied');
      await next();
    };

    const app = createApp({
      http: {
        controllers: [WildcardController],
        middlewares: [globalMiddleware],
      },
    });
    testApp = await onTest(app);

    const res = await testApp.request('/tests/wildcard/nested');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Global')).toBe('applied');
  });
});
