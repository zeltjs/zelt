import { HTTPException } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { UnauthorizedException } from './exceptions';

describe('UnauthorizedException', () => {
  it('is instanceof HTTPException', () => {
    const err = new UnauthorizedException({ reason: 'missing_token' });
    expect(err instanceof HTTPException).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('has correct status 401', () => {
    const err = new UnauthorizedException({ reason: 'missing_token' });
    expect(err.status).toBe(401);
  });

  it('has correct name', () => {
    const err = new UnauthorizedException({ reason: 'missing_token' });
    expect(err.name).toBe('UnauthorizedException');
  });

  it('exposes context property', () => {
    const err = new UnauthorizedException({ reason: 'invalid_token' });
    expect(err.context).toEqual({ reason: 'invalid_token' });
  });

  it('response body has correct message for missing_token', async () => {
    const err = new UnauthorizedException({ reason: 'missing_token' });
    const body = (await err.getResponse().json()) as { message: string };
    expect(body.message).toBe('Authorization token is required');
  });

  it('response body has correct message for invalid_token', async () => {
    const err = new UnauthorizedException({ reason: 'invalid_token' });
    const body = (await err.getResponse().json()) as { message: string };
    expect(body.message).toBe('Invalid authorization token');
  });

  it('response body has correct message for expired', async () => {
    const err = new UnauthorizedException({ reason: 'expired' });
    const body = (await err.getResponse().json()) as { message: string };
    expect(body.message).toBe('Authorization token has expired');
  });

  it('getResponse returns correct response with WWW-Authenticate header', async () => {
    const err = new UnauthorizedException({ reason: 'missing_token' });
    const res = err.getResponse();
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('getResponse returns JSON body with code and reason', async () => {
    const err = new UnauthorizedException({ reason: 'invalid_token' });
    const res = err.getResponse();
    const body = (await res.json()) as { code: string; reason: string; message: string };
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.reason).toBe('invalid_token');
    expect(body.message).toBe('Invalid authorization token');
  });
});
