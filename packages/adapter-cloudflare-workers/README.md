# @zeltjs/adapter-cloudflare-workers

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Cloudflare Workers adapter for Zelt.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
pnpm add @zeltjs/adapter-cloudflare-workers
```

## Usage

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Workers!' };
  }
}

const app = createApp({ controllers: [HelloController] });

const workers = await onCloudflareWorkers(app);

export default { fetch: workers.fetch };
```

## Options

```typescript
onCloudflareWorkers(app, {
  warmup: false, // default: false (lazy mode for cold start optimization)
});
```

- `warmup: false` (default) - Controllers are resolved on first request (optimized for serverless)
- `warmup: true` - All controllers are resolved during initialization

## Environment Variables

`onCloudflareWorkers()` automatically registers `CloudflareWorkersEnvAdaptor`, which reads from the `cloudflare:workers` env. Use `inject(Env)` to access environment variables:

```typescript
import { createApp, Controller, Get, Env, inject } from '@zeltjs/core';
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';

@Controller('/config')
class ConfigController {
  constructor(private env = inject(Env)) {}

  @Get('/')
  getApiHost() {
    return { apiHost: this.env.getString('API_HOST', 'localhost') };
  }
}

const app = createApp({
  http: { controllers: [ConfigController] },
});

const workers = await onCloudflareWorkers(app);

export default { fetch: workers.fetch };
```
