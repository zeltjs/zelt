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

**Worker entry point** (`src/worker.ts`):

```typescript source=examples/workers-url-shortener/src/worker.ts
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';

import { app } from './app';

const cfApp = await onCloudflareWorkers(app);

export default {
  fetch: cfApp.fetch,
};
```

**Controller with KV access** (`src/url/url.controller.ts`):

```typescript source=examples/workers-url-shortener/src/url/url.controller.ts
import {
  Controller,
  Get,
  HTTPException,
  inject,
  Post,
  request,
  requestContext,
  response,
} from '@zeltjs/core';
import type { Context } from 'hono';
import * as v from 'valibot';

import type { Env } from '../env';

import { KVService } from './kv.service';
import type { UrlRecord } from './types';

type RequestContext = Context<Env>;

const ShortenBody = v.object({
  url: v.pipe(v.string(), v.url()),
});

const generateCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

@Controller('/')
export class UrlController {
  constructor(private kv = inject(KVService)) {}

  @Post('/shorten')
  async shorten(
    req = request(ShortenBody),
    res = response(),
    ctx = requestContext() as RequestContext,
  ) {
    const body = await req.body();
    const code = generateCode();
    const record: UrlRecord = {
      url: body.url,
      createdAt: Date.now(),
      hits: 0,
    };
    await this.kv.set(ctx, code, record);
    return res.json({ code, shortUrl: `/${code}` }, 201);
  }

  @Get('/stats/:code')
  async stats(ctx = requestContext() as RequestContext) {
    const code = request().pathParam('code');
    const record = await this.kv.get(ctx, code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    return { code, url: record.url, hits: record.hits, createdAt: record.createdAt };
  }

  @Get('/:code')
  async redirect(res = response(), ctx = requestContext() as RequestContext) {
    const code = request().pathParam('code');
    const record = await this.kv.get(ctx, code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    await this.kv.incrementHits(ctx, code);
    return res.redirect(record.url, 302);
  }
}
```

**KV service** (`src/url/kv.service.ts`):

```typescript source=examples/workers-url-shortener/src/url/kv.service.ts
import { Injectable } from '@zeltjs/core';
import type { Context } from 'hono';

import type { Env } from '../env';

import type { UrlRecord } from './types';

type RequestContext = Context<Env>;

const getKV = (c: RequestContext): KVNamespace => c.env.URLS;

@Injectable()
export class KVService {
  async get(c: RequestContext, code: string): Promise<UrlRecord | null> {
    const data = await getKV(c).get(`url:${code}`, 'json');
    return data as UrlRecord | null;
  }

  async set(c: RequestContext, code: string, record: UrlRecord): Promise<void> {
    await getKV(c).put(`url:${code}`, JSON.stringify(record));
  }

  async incrementHits(c: RequestContext, code: string): Promise<void> {
    const record = await this.get(c, code);
    if (record) {
      record.hits += 1;
      await this.set(c, code, record);
    }
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
