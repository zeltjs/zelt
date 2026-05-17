---
---

# E2E Testing

Test your application's HTTP endpoints end-to-end using Hono's built-in request helper or the type-safe client.

## HTTP Testing

```typescript
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; toEqual(expected: unknown): void; };
@Controller('/hello') class HelloController { @Get('/:name') greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; } }
const app = createApp({ http: { controllers: [HelloController] } });
// ---cut---
describe('Hello API', () => {
  it('should return greeting', async () => {
    const res = await app.request('/hello/world');
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Hello, world!' });
  });
});
```

## Testing with Type-Safe Client

Use the generated `AppType` with Hono's client for fully typed tests. See [OpenAPI & Type Generation](../openapi.md) for how to generate `AppType`.

```typescript
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
declare function hc<T>(baseUrl: string, options?: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }): T;
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; };
@Controller('/hello') class HelloController { @Get('/:name') greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; } }
const app = createApp({ http: { controllers: [HelloController] } });
type AppType = { hello: { ':name': { $get: (opts: { param: { name: string } }) => Promise<Response & { json(): Promise<{ message: string }> }> } } };
// ---cut---
describe('Hello API', () => {
  const client = hc<AppType>('http://localhost', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input, init)),
  });

  it('should return greeting with type safety', async () => {
    const res = await client.hello[':name'].$get({ 
      param: { name: 'world' } 
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Hello, world!');
  });
});
```

## Full Application Testing

For complete E2E tests with real dependencies, use `onTest()` to apply test config overrides to your production app:

```typescript
import { createApp, Controller, Get, Post, pathParam, response } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import { onTest } from '@zeltjs/testing/vitest';
import { RedisConfig } from '@zeltjs/redis';
import { RedisTestContainerConfig } from '@zeltjs/redis/testing';
import * as v from 'valibot';
declare function hc<T>(baseUrl: string, options?: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }): T;
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function beforeAll(fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; };
type TestApp = Awaited<ReturnType<typeof onTest>>;
const UserBody = v.object({ name: v.string(), email: v.pipe(v.string(), v.email()) });
@Controller('/users') class UserController {
  @Get('/:id') findOne(id = pathParam('id')) { return { id, name: 'Alice', email: 'alice@example.com' }; }
  @Post('/') create(body = validated(UserBody), res = response()) { return res.json({ id: '1', ...body }, 201); }
}
type AppType = {
  users: {
    $post: (opts: { json: { name: string; email: string } }) => Promise<Response & { json(): Promise<{ id: string }> }>;
    ':id': { $get: (opts: { param: { id: string } }) => Promise<Response & { json(): Promise<{ id: string; name: string }> }> };
  };
};
// ---cut---
// Production app - same as your real application
const app = createApp({
  configs: [RedisConfig],
  http: { controllers: [UserController] },
});

describe('API E2E', () => {
  let testApp: TestApp;
  let client: AppType;

  beforeAll(async () => {
    // onTest() overrides RedisConfig with RedisTestContainerConfig
    testApp = await onTest(app, {
      configs: [RedisTestContainerConfig],
    });
    client = hc<AppType>('http://localhost', {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => 
        testApp.fetch(new Request(input, init)),
    });
  });

  it('should create and retrieve user', async () => {
    const createRes = await client.users.$post({
      json: { name: 'Alice', email: 'alice@example.com' },
    });
    expect(createRes.status).toBe(201);
    
    const { id } = await createRes.json();
    
    const getRes = await client.users[':id'].$get({
      param: { id },
    });
    expect(getRes.status).toBe(200);
    
    const user = await getRes.json();
    expect(user.name).toBe('Alice');
  });
});
```
