# @zeltjs/adapter-bun

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Bun runtime adapter for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
bun add @zeltjs/adapter-bun @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Bun!' };
  }
}

const app = createApp({
  http: { controllers: [HelloController] },
});

const bun = await onBun(app);
bun.listen(3000);
```
