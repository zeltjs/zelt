import { hc } from 'hono/client';
import { describe, expect, it } from 'vitest';

import { app } from '../app';
import type { AppType } from '../../generated/app.gen';

describe('/hello', () => {
  const client = hc<AppType>('https://example.local', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input, init)),
  });

  it('GET narrows response and returns greeting', async () => {
    // GET has no validated() arg, so AppType narrows status to 200 only — no
    // 400 union branch. `await res.json()` returns GreetResponse directly.
    const res = await client.hello[':name'].$get({ param: { name: 'zelt' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ message: 'hello, zelt' });
  });

  it('POST returns 201 with validated body', async () => {
    const res = await client.hello.$post({ json: { name: 'zelt', excited: true } });
    expect(res.status).toBe(201);
    if (res.status === 201) {
      const body = await res.json();
      expect(body).toMatchObject({ message: 'hello, zelt!!!' });
    }
  });

  it('POST returns 400 ValidationErrorBody on invalid payload', async () => {
    const res = await client.hello.$post({
      // @ts-expect-error — purposely invalid payload to trigger validation error
      json: { name: 123 },
    });
    expect(res.status).toBe(400);
    if (res.status === 400) {
      const body: { code: string; issues: unknown[] } = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(body.issues)).toBe(true);
    }
  });
});
