---
sidebar_label: Cloudflare Workers
---

# Getting Started with Cloudflare Workers

This guide walks you through building a Zelt application on Cloudflare Workers from scratch.

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier available)

## Installation

```bash
pnpm add @zeltjs/core @zeltjs/adapter-cloudflare-workers
pnpm add -D wrangler @cloudflare/workers-types
```

## Project Structure

```
my-worker/
├── src/
│   ├── app.ts
│   ├── index.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## Hello World

### Step 1: Create the Controller

Controllers handle incoming HTTP requests and return responses. Each controller is a class decorated with `@Controller` that defines a route prefix.

Create `src/controllers/hello.controller.ts`:

```typescript
import { Controller, Get, pathParam } from '@zeltjs/core';

@Controller('/hello')
export class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: `Hello, ${name}!` };
  }
}
```

- `@Controller('/hello')` — Sets the base path for all routes in this controller
- `@Get('/:name')` — Handles GET requests to `/hello/:name`
- `pathParam('name')` — Extracts the `name` parameter from the URL path

### Step 2: Create the Application

Create `src/app.ts` to wire up your controllers:

```typescript
import { createHttpApp } from '@zeltjs/core';
import { HelloController } from './controllers/hello.controller';

export const app = createHttpApp({
  controllers: [HelloController],
});
```

### Step 3: Create the Worker Entry Point

Create `src/index.ts` as the Cloudflare Workers entry point:

```typescript
import { onCloudflareWorkers } from '@zeltjs/adapter-cloudflare-workers';
import { app } from './app';

const workers = await onCloudflareWorkers(app);

export default { fetch: workers.fetch };
```

The `onCloudflareWorkers()` function is async and prepares your app for the Workers runtime. The returned object contains the `fetch` handler along with other utilities like `shutdown` and `get` for accessing services. By default, it uses **lazy initialization** (`warmup: false`) — controllers are resolved on the first request rather than at startup. This optimizes cold start times in serverless environments.

### Step 4: Configure Wrangler

Create `wrangler.toml`:

```toml
name = "my-zelt-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
API_HOST = "https://api.example.com"
```

### Step 5: Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "experimentalDecorators": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

### Step 6: Run Locally

```bash
npx wrangler dev
```

Visit `http://localhost:8787/hello/world` to see:

```json
{ "message": "Hello, world!" }
```

## Configuration

### Environment Variables

In Cloudflare Workers, environment variables are configured in `wrangler.toml` and accessed via `EnvService`.

```typescript
import { Controller, Get, inject, EnvService } from '@zeltjs/core';

@Controller('/config')
export class ConfigController {
  constructor(private env = inject(EnvService)) {}

  @Get('/api-host')
  getApiHost() {
    return { apiHost: this.env.get('API_HOST') ?? 'localhost' };
  }
}
```

Register `EnvConfig` in your app:

```typescript
import { createHttpApp, EnvConfig } from '@zeltjs/core';

export const app = createHttpApp({
  controllers: [ConfigController],
  configs: [EnvConfig],
});
```

**Important:** When you register `EnvConfig` and use `onCloudflareWorkers()`, the adapter automatically replaces it with `CloudflareWorkersEnvConfig`. This reads environment variables from the Workers runtime (`cloudflare:workers` module) instead of `process.env`.

### Secrets

For sensitive values, use Wrangler secrets instead of `[vars]`:

```bash
npx wrangler secret put DATABASE_URL
```

Access them the same way via `EnvService`:

```typescript
const dbUrl = this.env.get('DATABASE_URL');
```

## Services

Services work identically to Node.js. Use `@Injectable` to mark a class as a service.

```typescript
import { Injectable } from '@zeltjs/core';

@Injectable()
export class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}
```

Inject into controllers:

```typescript
import { Controller, Get, pathParam, inject } from '@zeltjs/core';
import { GreetingService } from '../services/greeting.service';

@Controller('/hello')
export class HelloController {
  constructor(private greetingService = inject(GreetingService)) {}

  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: this.greetingService.greet(name) };
  }
}
```

## Deploy

Deploy your worker to Cloudflare's global network:

```bash
npx wrangler deploy
```

Your worker will be available at `https://my-zelt-worker.<your-subdomain>.workers.dev`.

## Advanced: Warmup Option

By default, `onCloudflareWorkers()` uses lazy initialization (`warmup: false`) to minimize cold start time. Controllers are resolved on the first request.

If you prefer to resolve all controllers at initialization (useful for debugging or when cold start time is less critical), set `warmup: true`:

```typescript
const workers = await onCloudflareWorkers(app, { warmup: true });

export default { fetch: workers.fetch };
```

| Option | Behavior | Use Case |
|--------|----------|----------|
| `warmup: false` (default) | Controllers resolved on first request | Optimized cold starts |
| `warmup: true` | All controllers resolved at initialization | Debugging, warm environments |

## What's Next?

Now that you have a basic worker running, explore more features:

- [Controllers](../controllers) — Route handling and HTTP methods
- [Services](../services) — Business logic and dependency injection
- [Validation](../validation) — Request body validation with Valibot
- [Middleware](../middleware) — Request/response interceptors
- [Configuration](../configuration) — Advanced configuration patterns
