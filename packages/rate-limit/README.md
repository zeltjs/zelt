# @zeltjs/rate-limit

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Rate limiting middleware for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/rate-limit @zeltjs/kv @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { RateLimitConfig, RateLimitMiddleware, RateLimit } from '@zeltjs/rate-limit';

@Controller('/api')
class ApiController {
  @Get('/data')
  @RateLimit({ limit: 100, window: 60 })
  getData() {
    return { data: 'rate limited endpoint' };
  }
}

const app = createApp({
  http: {
    controllers: [ApiController],
    middlewares: [RateLimitMiddleware],
  },
  configs: [RateLimitConfig],
});
```
