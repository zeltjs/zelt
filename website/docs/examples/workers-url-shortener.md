---
---

# Workers URL Shortener

A URL shortener running on Cloudflare Workers with KV storage.

**Location:** `examples/workers-url-shortener`

## Features

- Cloudflare Workers deployment
- KV storage for persistence
- URL validation
- Hit counter for analytics

## Running

```bash
cd examples/workers-url-shortener
pnpm install
pnpm dev
```

## Key Code

**Worker entry point:**

```typescript
import { app } from './app';

export default {
  fetch: app.fetch,
};
```

**Controller with KV access:**

```typescript
import { Controller, Get, Post, inject, pathParam, requestContext, validated } from '@zeltjs/core';
import * as v from 'valibot';

const ShortenBody = v.object({
  url: v.pipe(v.string(), v.url()),
});

@Controller('/')
class UrlController {
  constructor(private kv = inject(KVService)) {}

  @Post('/shorten')
  async shorten(body = validated(ShortenBody), res = response(), ctx = requestContext()) {
    const code = generateCode();
    await this.kv.set(ctx, code, { url: body.url, createdAt: Date.now(), hits: 0 });
    return res.json({ code, shortUrl: `/${code}` }, 201);
  }

  @Get('/:code')
  async redirect(code = pathParam('code'), res = response(), ctx = requestContext()) {
    const record = await this.kv.get(ctx, code);
    if (!record) throw new HTTPException(404, { message: 'URL not found' });
    await this.kv.incrementHits(ctx, code);
    return res.redirect(record.url, 302);
  }
}
```

**KV service:**

```typescript
import { Injectable } from '@zeltjs/core';

@Injectable()
class KVService {
  async get(c: RequestContext, code: string) {
    return c.env.URLS.get(`url:${code}`, 'json');
  }

  async set(c: RequestContext, code: string, record: UrlRecord) {
    await c.env.URLS.put(`url:${code}`, JSON.stringify(record));
  }
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/shorten` | Create a short URL |
| GET | `/:code` | Redirect to original URL |
| GET | `/stats/:code` | Get URL statistics |

## wrangler.toml

```toml
name = "url-shortener"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "URLS"
id = "your-kv-namespace-id"
```
