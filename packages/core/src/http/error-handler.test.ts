import * as v from 'valibot';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toErrorResponse } from './error-handler';

describe('toErrorResponse — ValiError', () => {
  it('returns 400 with structured issues for ValiError', async () => {
    const result = v.safeParse(v.object({ name: v.string() }), {});
    if (result.issues === undefined) {
      throw new Error('expected ValiError fixture to produce issues');
    }
    const error = new v.ValiError(result.issues);
    const res = toErrorResponse(error);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; issues: unknown[] };
    expect(json.error).toBe('validation_failed');
    expect(json.issues.length).toBeGreaterThan(0);
  });
});

describe('toErrorResponse — HTTPException', () => {
  it('returns status + http_exception body when no res override', async () => {
    const err = new HTTPException(404, { message: 'not found' });
    const res = toErrorResponse(err);
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string; message: string };
    expect(json).toEqual({ error: 'http_exception', message: 'not found' });
  });

  it('passes through res override when present', async () => {
    const custom = Response.json({ custom: true }, { status: 418 });
    const err = new HTTPException(418, { res: custom });
    const res = toErrorResponse(err);
    expect(res.status).toBe(418);
    const json = (await res.json()) as { custom: boolean };
    expect(json).toEqual({ custom: true });
  });

  it('does not leak cause to response body', async () => {
    const err = new HTTPException(500, {
      message: 'wrapped',
      cause: new Error('internal secret'),
    });
    const res = toErrorResponse(err);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ error: 'http_exception', message: 'wrapped' });
    expect(JSON.stringify(json)).not.toContain('internal secret');
  });
});

describe('toErrorResponse — internal_error (env-guarded message)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the original message when NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = toErrorResponse(new Error('database connection failed'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string; message: string };
    expect(json).toEqual({ error: 'internal_error', message: 'database connection failed' });
  });

  it('returns generic message when NODE_ENV=production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = toErrorResponse(new Error('database connection failed'));
    const json = (await res.json()) as { error: string; message: string };
    expect(json).toEqual({ error: 'internal_error', message: 'internal server error' });
  });

  it('returns generic message when NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const res = toErrorResponse(new Error('boom'));
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('internal server error');
  });

  it('returns generic message when NODE_ENV is undefined', async () => {
    vi.stubEnv('NODE_ENV', undefined as unknown as string);
    const res = toErrorResponse(new Error('boom'));
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('internal server error');
  });

  it('returns generic message for non-Error thrown values regardless of env', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = toErrorResponse('not an Error');
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('internal server error');
  });
});
