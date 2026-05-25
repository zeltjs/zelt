import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { RequestIdService } from '../src/request-id.service';

describe('Request-scoped data via getContext/setContext', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;
  let serviceCallsAtStart = 0;

  beforeAll(async () => {
    serviceCallsAtStart = RequestIdService.constructorCalls;
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('isolates context values between sequential requests', async () => {
    const firstRes = await testApp.request('/scopes/request', {
      headers: { 'X-Request-Id': 'req-1' },
    });
    const first = (await firstRes.json()) as {
      requestId: string;
      tickValues: number[];
      trace: string[];
    };

    const secondRes = await testApp.request('/scopes/request', {
      headers: { 'X-Request-Id': 'req-2' },
    });
    const second = (await secondRes.json()) as {
      requestId: string;
      tickValues: number[];
      trace: string[];
    };

    expect(first.requestId).toBe('req-1');
    expect(second.requestId).toBe('req-2');
    // Counter restarts from 1 every request because state lives in the
    // per-request context, not on the singleton service.
    expect(first.tickValues).toEqual([1, 2]);
    expect(second.tickValues).toEqual([1, 2]);
    expect(first.trace).toEqual(['begin', 'end']);
    expect(second.trace).toEqual(['begin', 'end']);
  });

  it('still uses a single RequestIdService instance for every request', async () => {
    await testApp.request('/scopes/request', {
      headers: { 'X-Request-Id': 'req-a' },
    });
    await testApp.request('/scopes/request', {
      headers: { 'X-Request-Id': 'req-b' },
    });
    await testApp.request('/scopes/request', {
      headers: { 'X-Request-Id': 'req-c' },
    });

    expect(RequestIdService.constructorCalls - serviceCallsAtStart).toBe(1);
  });

  it('reports the singleton constructor count in the response payload', async () => {
    const res = await testApp.request('/scopes/request', {
      headers: { 'X-Request-Id': 'req-report' },
    });
    const body = (await res.json()) as {
      requestIdServiceConstructorCalls: number;
    };

    expect(body.requestIdServiceConstructorCalls - serviceCallsAtStart).toBe(1);
  });
});
