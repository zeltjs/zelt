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
  fetch: cfApp.http.fetch,
};
```

**Controller with KV access** (`src/url/url.controller.ts`):

```typescript source=examples/workers-url-shortener/src/url/url.controller.ts
import { Controller, Get, HTTPException, inject, Post, request, response } from '@zeltjs/core';
import * as v from 'valibot';

import { KVService } from './kv.service';
import type { UrlRecord } from './types';

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
  async shorten(req = request(ShortenBody), res = response()) {
    const body = await req.body();
    const code = generateCode();
    const record: UrlRecord = {
      url: body.url,
      createdAt: Date.now(),
      hits: 0,
    };
    await this.kv.set(code, record);
    return res.json({ code, shortUrl: `/${code}` }, 201);
  }

  @Get('/stats/:code')
  async stats(req = request()) {
    const code = req.pathParam('code');
    const record = await this.kv.get(code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    return { code, url: record.url, hits: record.hits, createdAt: record.createdAt };
  }

  @Get('/:code')
  async redirect(req = request(), res = response()) {
    const code = req.pathParam('code');
    const record = await this.kv.get(code);
    if (!record) {
      throw new HTTPException(404, { message: 'URL not found' });
    }
    await this.kv.incrementHits(code);
    return res.redirect(record.url, 302);
  }
}
```

**KV service** (`src/url/kv.service.ts`):

```typescript source=examples/workers-url-shortener/src/url/kv.service.ts
import { CloudflareBindings } from '@zeltjs/adapter-cloudflare-workers';
import { Injectable, inject } from '@zeltjs/core';

import type { UrlRecord } from './types';

@Injectable()
export class KVService {
  constructor(private readonly bindings = inject(CloudflareBindings)) {}

  async get(code: string): Promise<UrlRecord | null> {
    return this.bindings.get('URLS').get<UrlRecord>(`url:${code}`, 'json');
  }

  async set(code: string, record: UrlRecord): Promise<void> {
    await this.bindings.get('URLS').put(`url:${code}`, JSON.stringify(record));
  }

  async incrementHits(code: string): Promise<void> {
    const record = await this.get(code);
    if (record) {
      record.hits += 1;
      await this.set(code, record);
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
