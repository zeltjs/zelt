import { Controller, createApp, http, Post } from '@zeltjs/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { request } from './index';

const Schema = v.object({ name: v.string(), age: v.number() });

describe('request() with Valibot schema', () => {
  it('returns parsed body when schema matches (json)', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      async json(req = request(Schema)) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada', age: 36 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada', age: 36 });
  });

  it('returns parsed body when schema matches (form)', async () => {
    const FormSchema = v.object({ name: v.string() });

    @Controller('/')
    class TestController {
      @Post('/form')
      async form(req = request(FormSchema, { target: 'form' })) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const formData = new FormData();
    formData.append('name', 'Ada');
    const res = await readyApp.http.fetch(
      new Request('http://localhost/form', {
        method: 'POST',
        body: formData,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada' });
  });

  it('throws HTTPException with 400 when schema does not match', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      async json(req = request(Schema)) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('HTTPException contains VALIDATION_FAILED response', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      async json(req = request(Schema)) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; issues: unknown[] };
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(json.issues.length).toBeGreaterThan(0);
  });
});
