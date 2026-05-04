---
sidebar_position: 7
---

# Testing

:::info Coming Soon
Testing documentation is under development.
:::

Koya provides `@koya/testing` package with utilities for testing your application.

## Installation

```bash
pnpm add -D @koya/testing vitest
```

## Basic Example

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

Use the generated `AppType` with Hono's client for fully typed tests. See [OpenAPI & Type Generation](./openapi.md) for how to generate `AppType`.

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
    // body is fully typed as { message: string }
    expect(body.message).toBe('Hello, world!');
  });
});
```

Stay tuned for comprehensive testing documentation including mocking, integration testing, and best practices.
