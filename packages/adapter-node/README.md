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
import { createApp, http, Controller, Get } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Node.js!' };
  }
}

const app = createApp([http({ controllers: [HelloController] })]);

const nodeApp = await onNode(app);
const server = await nodeApp.http.listen({ port: 3000 });
console.log(`Listening on port ${server.address.port}`);
```

Each named `http()` feature gets its own namespace with an independent `listen()`, sharing the same runtime and services:

```typescript
const app = createApp([
  http({ controllers: [HelloController] }),
  http({ name: 'admin', controllers: [AdminController] }),
]);

const nodeApp = await onNode(app);
await nodeApp.http.listen(3000);
await nodeApp.admin.listen(8080);
```
