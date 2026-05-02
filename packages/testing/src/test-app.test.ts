import { Controller, Get, Post, createApp, validated } from '@koya/core';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { createTestApp } from './test-app';

@Controller('/items')
class ItemController {
  @Get('/')
  list() {
    return { items: ['a', 'b'] };
  }
  @Post('/')
  create() {
    const body = validated(v.object({ name: v.string() }));
    return { created: body.name };
  }
}

const buildTest = () => {
  const app = createApp({ providers: [ItemController] });
  return createTestApp(app, { controllers: [ItemController] });
};

describe('createTestApp', () => {
  it('routes a GET request through the full http runtime', async () => {
    const test = buildTest();
    const res = await test.request('GET', '/items/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: ['a', 'b'] });
  });

  it('serializes a JSON body on POST and reaches validated() in handler', async () => {
    const test = buildTest();
    const res = await test.request('POST', '/items/', { name: 'Ada' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 'Ada' });
  });
});
