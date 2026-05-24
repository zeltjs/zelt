import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { defineHttpException } from './define-http-exception';

describe('defineHttpException', () => {
  it('creates HTTPException subclass with correct name', () => {
    const TestException = defineHttpException('TestException', 400, () => 'bad');
    const err = new TestException({});
    expect(err.name).toBe('TestException');
  });

  it('uses default status code', () => {
    const TestException = defineHttpException('TestException', 429, () => 'limited');
    const err = new TestException({});
    expect(err.status).toBe(429);
  });

  it('allows status override', () => {
    const TestException = defineHttpException('TestException', 429, () => 'limited');
    const err = new TestException({}, { status: 503 });
    expect(err.status).toBe(503);
  });

  it('works with instanceof HTTPException', () => {
    const TestException = defineHttpException('TestException', 400, () => 'bad');
    const err = new TestException({});
    expect(err instanceof TestException).toBe(true);
    expect(err instanceof HTTPException).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('exposes context property', () => {
    const TestException = defineHttpException(
      'TestException',
      429,
      (ctx: { limit: number }) => `Limit: ${ctx.limit}`,
    );
    const err = new TestException({ limit: 100 });
    expect(err.context).toEqual({ limit: 100 });
  });

  it('formats message using context', () => {
    const TestException = defineHttpException(
      'TestException',
      400,
      (ctx: { field: string }) => `Invalid field: ${ctx.field}`,
    );
    const err = new TestException({ field: 'email' });
    expect(err.message).toBe('Invalid field: email');
  });

  it('supports error cause', () => {
    const TestException = defineHttpException('TestException', 500, () => 'wrapped');
    const cause = new Error('original');
    const err = new TestException({}, { cause });
    expect(err.cause).toBe(cause);
  });

  it('builds response with custom body and headers', async () => {
    const TestException = defineHttpException(
      'TestException',
      429,
      (ctx: { retryAfter: number }) => `Retry after ${ctx.retryAfter}s`,
      {
        buildResponse: (ctx, status, message) =>
          Response.json(
            { code: 'RATE_LIMITED', message, retryAfterSec: ctx.retryAfter },
            {
              status,
              headers: { 'Retry-After': String(ctx.retryAfter) },
            },
          ),
      },
    );
    const err = new TestException({ retryAfter: 60 });
    const res = err.getResponse();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.retryAfterSec).toBe(60);
  });

  it('creates distinct exception classes for different names', () => {
    const ExceptionA = defineHttpException('ExceptionA', 400, () => 'A');
    const ExceptionB = defineHttpException('ExceptionB', 401, () => 'B');
    const errA = new ExceptionA({});
    const errB = new ExceptionB({});
    expect(errA instanceof ExceptionA).toBe(true);
    expect(errA instanceof ExceptionB).toBe(false);
    expect(errB instanceof ExceptionB).toBe(true);
    expect(errB instanceof ExceptionA).toBe(false);
  });
});
