# @zeltjs/adapter-cloudflare-workers

Cloudflare Workers adapter for Zelt.

## Installation

```bash
pnpm add @zeltjs/adapter-cloudflare-workers
```

## Usage

```typescript
import { createHttpApp, Controller, Get } from '@zeltjs/core';
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Workers!' };
  }
}

const app = createHttpApp({ controllers: [HelloController] });

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

When using `EnvConfig`, it is automatically replaced with `CloudflareWorkersEnvConfig` which reads from `cloudflare:workers` env:

```typescript
import { createHttpApp, Controller, Get, EnvConfig, EnvService, inject } from '@zeltjs/core';
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';

@Controller('/config')
class ConfigController {
  constructor(private env = inject(EnvService)) {}

  @Get('/')
  getApiHost() {
    return { apiHost: this.env.get('API_HOST') };
  }
}

const app = createHttpApp({
  controllers: [ConfigController],
  configs: [EnvConfig],
});

const workers = await onCloudflareWorkers(app);

export default { fetch: workers.fetch };
```
