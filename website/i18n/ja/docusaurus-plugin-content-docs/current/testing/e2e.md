---
---

# E2E Testing

Honoの組み込みrequest helperまたは型安全なclientを使って、アプリケーションのHTTPエンドポイントをend-to-endでテストします。

## HTTP Testing {#http-testing}

```typescript
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; toEqual(expected: unknown): void; };
@Controller('/hello') class HelloController { @Get('/:name') greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; } }
const app = createApp([http({ controllers: [HelloController] })]);
const readyApp = await app.createRuntime();
// ---cut---
describe('Hello API', () => {
  it('should return greeting', async () => {
    const res = await readyApp.http.request('/hello/world');
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Hello, world!' });
  });
});
```

## 型安全なClientでのテスト {#testing-with-type-safe-client}

生成された `AppType` をHonoのclientとともに使うと、完全に型付けされたテストが書けます。`AppType` の生成方法については [OpenAPI & Type Generation](../openapi.md) を参照してください。

```typescript
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
declare function hc<T>(baseUrl: string, options?: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }): T;
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; };
@Controller('/hello') class HelloController { @Get('/:name') greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; } }
const app = createApp([http({ controllers: [HelloController] })]);
const readyApp = await app.createRuntime();
type AppType = { hello: { ':name': { $get: (opts: { param: { name: string } }) => Promise<Response & { json(): Promise<{ message: string }> }> } } };
// ---cut---
describe('Hello API', () => {
  const client = hc<AppType>('http://localhost', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => readyApp.http.fetch(new Request(input, init)),
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

## Full Application Testing {#full-application-testing}

実際の依存関係を使った完全なE2Eテストには、`onTest()` を使って本番用アプリにtest configのoverrideを適用します。

```typescript
import { createApp, Controller, Get, Post, response, http } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { onTest } from '@zeltjs/testing/vitest';
import { RedisConfig } from '@zeltjs/redis';
import { RedisTestContainerConfig } from '@zeltjs/redis/testing';
import * as v from 'valibot';
declare function hc<T>(baseUrl: string, options?: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }): T;
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function beforeAll(fn: () => void | Promise<void>): void;
declare function expect<T>(value: T): { toBe(expected: T): void; };
const UserBody = v.object({ name: v.string(), email: v.pipe(v.string(), v.email()) });
@Controller('/users') class UserController {
  @Get('/:id') findOne(req = request()) { const id = req.pathParam('id'); return { id, name: 'Alice', email: 'alice@example.com' }; }
  @Post('/') async create(req = request(UserBody), res = response()) { const body = await req.body(); return res.json({ id: '1', ...body }, 201); }
}
type AppType = {
  users: {
    $post: (opts: { json: { name: string; email: string } }) => Promise<Response & { json(): Promise<{ id: string }> }>;
    ':id': { $get: (opts: { param: { id: string } }) => Promise<Response & { json(): Promise<{ id: string; name: string }> }> };
  };
};
// ---cut---
// 本番用app - 実際のアプリケーションと同じ
const app = createApp([http({ controllers: [UserController] })], { configs: [RedisConfig] });

describe('API E2E', () => {
  let testApp: Awaited<ReturnType<typeof app.createRuntime>>;
  let client: AppType;

  beforeAll(async () => {
    // onTest()はRedisConfigをRedisTestContainerConfigでoverrideする
    testApp = await onTest(app, {
      configs: [RedisTestContainerConfig],
    });
    client = hc<AppType>('http://localhost', {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => 
        testApp.http.fetch(new Request(input, init)),
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
