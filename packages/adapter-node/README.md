# @zeltjs/adapter-node

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Node.js HTTP server adapter for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/adapter-node @zeltjs/core
```

## Usage

```typescript
import { createApp, http, Controller, Get, httpServer } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Node.js!' };
  }
}

const app = createApp([httpServer(), http({ controllers: [HelloController] })]);

const nodeApp = await onNode(app);
const server = await nodeApp.httpServer.listen(nodeApp.http, { port: 3000 });
console.log(`Listening on port ${server.address.port}`);
```

Each named `http()` feature retains its own namespace. Declare `httpServer()` once and pass the HTTP feature to each `httpServer.listen()` call, sharing the same runtime and services:

```typescript
import { httpServer, createApp, http } from '@zeltjs/core';
@Controller('/admin')
class AdminController {
  @Get('/')
  status() {
    return { admin: true };
  }
}

const app = createApp([httpServer(),
  http({ controllers: [HelloController] }),
  http({ name: 'admin', controllers: [AdminController] }),
]);

const nodeApp = await onNode(app);
await nodeApp.httpServer.listen(nodeApp.http, 3000);
await nodeApp.httpServer.listen(nodeApp.admin, 8080);
```
