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
import { createApp, http, Controller, Get, httpServer } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Bun!' };
  }
}

const app = createApp([httpServer(), http({ controllers: [HelloController] })]);

const bunApp = await onBun(app);
await bunApp.httpServer.listen(bunApp.http, { port: 3000 });
```

Server handles provide `address`, `closed`, and `shutdown()`. Shutdown follows Bun's native graceful stop: it refuses new TCP connections, while already accepted keep-alive connections may remain usable until the client closes them.
