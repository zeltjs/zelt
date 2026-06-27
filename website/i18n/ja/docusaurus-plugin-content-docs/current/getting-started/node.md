---
sidebar_label: Node.js
---

# Getting Started with Node.js

This guide walks you through building a Zelt application on Node.js from scratch.

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- A package manager: [pnpm](https://pnpm.io/) (recommended), npm, or bun

## Installation

```bash
pnpm add @zeltjs/core @zeltjs/adapter-node
```

## Project Structure

```
my-app/
├── src/
│   ├── app.ts
│   ├── main.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
└── tsconfig.json
```

## Hello World

### Step 1: Create the Controller

Controllers handle incoming HTTP requests and return responses. Each controller is a class decorated with `@Controller` that defines a route prefix.

Create `src/controllers/hello.controller.ts`:

```typescript
import { Controller, Get, request } from '@zeltjs/core';
// ---cut---
@Controller('/hello')
export class HelloController {
  @Get('/:name')
  greet(req = request()) {
    const name = req.pathParam('name');
    return { message: `Hello, ${name}!` };
  }
}
```

- `@Controller('/hello')` — Sets the base path for all routes in this controller
- `@Get('/:name')` — Handles GET requests to `/hello/:name`
- `pathParam('name')` — Extracts the `name` parameter from the URL path

### Step 2: Create the Application

Create `src/app.ts` to wire up your controllers and prepare for the Node.js runtime:

```typescript
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}
// ---cut---
export const app = createApp([http({
    controllers: [HelloController],
  })]);

export default await onNode(app);
```

The `onNode()` function prepares your app for the Node.js runtime, returning a `NodeApp` with `http.listen()`, `get()`, and `args` properties.

### Step 3: Start the Server

Create `src/main.ts` to start the server:

```typescript
import { createApp, Controller, Get, request, http } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(req = request()) { const name = req.pathParam('name'); return { message: `Hello, ${name}!` }; }
}

const app = createApp([http({ controllers: [HelloController] })]);
const nodeApp = await onNode(app);
// ---cut---
const server = await nodeApp.http.listen({ port: 3000 });
console.log(`Server running at http://localhost:${server.address.port}`);
```

### Step 4: Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### Step 5: Run the Application

```bash
npx tsx src/main.ts
```

Visit `http://localhost:3000/hello/world` to see:

```json
{ "message": "Hello, world!" }
```

## Adding Services

Services contain business logic and can be injected into controllers. Use `@Injectable` to mark a class as a service.

Create `src/services/greeting.service.ts`:

```typescript
import { Injectable } from '@zeltjs/core';
// ---cut---
@Injectable()
export class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}
```

Update your controller to use the service:

```typescript
import { Controller, Get, request, inject, Injectable } from '@zeltjs/core';
@Injectable()
class GreetingService {
  greet(name: string): string { return `Hello, ${name}!`; }
}
// ---cut---
@Controller('/hello')
export class HelloController {
  constructor(private greetingService = inject(GreetingService)) {}

  @Get('/:name')
  greet(req = request()) {
    const name = req.pathParam('name');
    return { message: this.greetingService.greet(name) };
  }
}
```

## Configuration

Zelt provides configuration classes for managing environment variables.

### Using Environment Variables

```typescript
import { Controller, Get, inject, Env } from '@zeltjs/core';
// ---cut---
@Controller('/config')
export class ConfigController {
  constructor(private env = inject(Env)) {}

  @Get('/api-host')
  getApiHost() {
    return { apiHost: this.env.getString('API_HOST', 'localhost') };
  }
}
```

Register your app:

```typescript
import { createApp, Controller, Get, inject, Env, http } from '@zeltjs/core';
@Controller('/config')
class ConfigController {
  constructor(private env = inject(Env)) {}
  @Get('/api-host')
  getApiHost() { return { apiHost: this.env.getString('API_HOST', 'localhost') }; }
}
// ---cut---
export const app = createApp([http({
    controllers: [ConfigController],
  })]);
```

## What's Next?

Now that you have a basic application running, explore more features:

- [Controllers](../controllers) — Route handling and HTTP methods
- [Services](../services) — Business logic and dependency injection
- [Validation](../validation) — Request body validation with Valibot
- [Middleware](../middleware) — Request/response interceptors
- [Configuration](../configuration) — Advanced configuration patterns
