import { describe, expect, expectTypeOf, it } from 'vitest';

import { http } from '../features/http.feature';
import { Controller, Get } from '../index';
import type { ReadyApp } from './create-app.lib';
import { createApp } from './create-app.lib';

@Controller('/')
class TestController {
  @Get('/hello')
  hello() {
    return { message: 'hello' };
  }
}

describe('createApp (feature-based)', () => {
  it('returns an App with ready() method', () => {
    const app = createApp([http({ controllers: [TestController] })]);
    expect(typeof app.ready).toBe('function');
  });

  it('ready() returns ReadyApp with namespaced caps', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    expect(typeof readyApp.http.fetch).toBe('function');
    expect(typeof readyApp.http.request).toBe('function');
    expect(typeof readyApp.get).toBe('function');
    expect(typeof readyApp.shutdown).toBe('function');

    const res = await readyApp.http.request('/hello');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello' });

    await readyApp.shutdown();
  });

  it('each ready() creates an independent instance', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const a = await app.ready();
    const b = await app.ready();

    expect(a).not.toBe(b);

    const resA = await a.http.request('/hello');
    const resB = await b.http.request('/hello');
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    await a.shutdown();
    await b.shutdown();
  });

  it('ready() accepts config overrides', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready({ configs: [] });
    expect(typeof readyApp.http.request).toBe('function');
    await readyApp.shutdown();
  });

  it('empty caps features do not appear on ReadyApp', () => {
    type EmptyFeature = { key: 'empty'; bind: () => void; resolve: () => object };
    type Result = ReadyApp<readonly [EmptyFeature]>;
    expectTypeOf<Result>().toHaveProperty('get');
    expectTypeOf<Result>().toHaveProperty('shutdown');
    expectTypeOf<Result>().not.toHaveProperty('empty');
  });

  it('caps are correctly namespaced in types', () => {
    type HttpFeature = ReturnType<typeof http>;
    type Result = ReadyApp<readonly [HttpFeature]>;
    expectTypeOf<Result>().toHaveProperty('http');
  });
});
