import { Controller, createApp, http, Post, request } from '@zeltjs/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

const CreateUserSchema = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

describe('request() imported from @zeltjs/core with Valibot', () => {
  it('validates a real Valibot schema at runtime', async () => {
    @Controller('/users')
    class UserController {
      @Post('/')
      async create(req = request(CreateUserSchema)) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [UserController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/users/', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada', email: 'ada@example.com' });
  });
});
