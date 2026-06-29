import { hc } from 'hono/client';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppType } from '../../generated/app.gen';
import { app } from '../app';

let readyApp: Awaited<ReturnType<typeof app.createRuntime>>;

type ResponseWithStatus = { readonly status: number };
type ExpectStatus = <R extends ResponseWithStatus, S extends R['status']>(
  res: R,
  status: S,
) => asserts res is Extract<R, { readonly status: S }>;

const expectStatus: ExpectStatus = (res, status) => {
  expect(res.status).toBe(status);
};

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
    expectStatus(res, 201);

    const body = await res.json();
    expect(body.message).toBe('hello, zelt!!!');
  });

  it('POST returns 400 ValidationErrorBody on invalid payload', async () => {
    const res = await getClient().hello.$post({ json: JSON.parse('{"name":123}') });
    expectStatus(res, 400);

    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
