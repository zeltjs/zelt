---
---

# E2E Testing

Test your application's HTTP endpoints end-to-end using Hono's built-in request helper or the type-safe client.

## HTTP Testing

```typescript
import { describe, it, expect } from 'vitest';
import { app } from './app';

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
import { hc } from 'hono/client';
import { describe, it, expect } from 'vitest';
import { app } from './app';
import type { AppType } from './generated/app.gen';

describe('Hello API', () => {
  const client = hc<AppType>('http://localhost', {
    fetch: (input, init) => app.fetch(new Request(input, init)),
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

For complete E2E tests with real dependencies, combine with [Integration Testing](./integration.md):

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hc } from 'hono/client';
import { createApp } from './app';
import { RedisTestContainerConfig } from '@zeltjs/testing/redis';
import type { AppType } from './generated/app.gen';

describe('API E2E', () => {
  let app: ReturnType<typeof createApp>;
  let client: ReturnType<typeof hc<AppType>>;

  beforeAll(async () => {
    app = await createApp({
      configs: [RedisTestContainerConfig],
    });
    client = hc<AppType>('http://localhost', {
      fetch: (input, init) => app.fetch(new Request(input, init)),
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
