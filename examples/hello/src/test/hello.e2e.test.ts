import { hc } from 'hono/client';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppType } from '../../generated/app.gen';
import { app } from '../app';

let readyApp: Awaited<ReturnType<typeof app.createRuntime>>;

beforeAll(async () => {
  readyApp = await app.createRuntime();
});

describe('/hello', () => {
  const getClient = () =>
    hc<AppType>('https://example.local', {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        readyApp.http.fetch(new Request(input, init)),
    });

  it('GET narrows response and returns greeting', async () => {
    // GET has no request() body arg, so AppType narrows status to 200 only - no
    // 400 union branch. `await res.json()` returns GreetResponse directly.
    const res = await getClient().hello[':name'].$get({ param: { name: 'zelt' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ message: 'hello, zelt' });
  });

  it('POST returns 201 with validated body', async () => {
    const res = await getClient().hello.$post({ json: { name: 'zelt', excited: true } });
    if (res.status === 400) {
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
      return;
    }

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ message: 'hello, zelt!!!' });
  });

  it('POST returns 400 ValidationErrorBody on invalid payload', async () => {
    const res = await getClient().hello.$post({ json: JSON.parse('{"name":123}') });
    expect(res.status).toBe(400);
    if (res.status !== 400) throw new Error(`Unexpected status: ${res.status}`);

    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
