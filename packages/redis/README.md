# @zeltjs/redis

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Redis integration for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/redis @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Get, inject } from '@zeltjs/core';
import { RedisConfig, RedisService } from '@zeltjs/redis';

@Controller('/cache')
class CacheController {
  constructor(private redis = inject(RedisService)) {}

  @Get('/:key')
  async get(key: string) {
    const value = await this.redis.get(key);
    return { value };
  }
}

const app = createApp({
  http: { controllers: [CacheController] },
  configs: [RedisConfig],
});
```
