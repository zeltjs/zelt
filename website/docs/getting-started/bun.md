---
sidebar_label: Bun
---

# Getting Started with Bun

This guide walks you through building a Zelt application on Bun from scratch.

## Prerequisites

- [Bun](https://bun.sh/) v1.0 or higher

## Installation

```bash
bun add @zeltjs/core @zeltjs/adapter-bun
```

## Project Structure

```
my-app/
├── src/
│   ├── app.ts
│   ├── index.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
└── tsconfig.json
```

## Hello World

### Step 1: Create the Controller

Create `src/controllers/hello.controller.ts`:

```typescript
// @noErrors
import { Controller, Get, pathParam } from '@zeltjs/core';
// ---cut---
@Controller('/hello')
export class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: `Hello, ${name}!` };
  }
}
```

### Step 2: Create the Application

Create `src/app.ts`:

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}
// ---cut---
export const app = createApp({
  http: {
    controllers: [HelloController],
  },
});
```

### Step 3: Create the Entry Point

Create `src/index.ts`:

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp({ http: { controllers: [HelloController] } });
// ---cut---
const bunApp = await onBun(app);

const server = bunApp.serve({ port: 3000 });
console.log(`Server running at http://${server.address.hostname}:${server.address.port}`);
```

The `onBun()` function prepares your app for the Bun runtime. It returns an object with:

- `serve(options?)` — Starts an HTTP server using `Bun.serve()`
- `shutdown()` — Gracefully shuts down the application
- `get<T>(Class)` — Resolves a service from the DI container
- `args` — Command-line arguments (`Bun.argv.slice(2)`)

### Step 4: Run the Server

```bash
bun run src/index.ts
```

Visit `http://localhost:3000/hello/world` to see:

```json
{ "message": "Hello, world!" }
```

## Server Options

The `serve()` method accepts options for port and hostname:

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp({ http: { controllers: [HelloController] } });
const bunApp = await onBun(app);
// ---cut---
const server = bunApp.serve({
  port: 8080,
  hostname: '127.0.0.1',
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `3000` | Port to listen on |
| `hostname` | `'0.0.0.0'` | Hostname to bind to |

## Command Support

If your app includes commands, `onBun()` returns `execCommand()` for CLI execution:

```typescript
// @noErrors
import { createApp, Command, Arg, Controller, Get } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/') greet() { return { message: 'Hello!' }; }
}

@Command('greet')
class GreetCommand {
  constructor(private name = Arg(0)) {}
  run() { console.log(`Hello, ${this.name}!`); }
}

const app = createApp({
  http: { controllers: [HelloController] },
  commands: [GreetCommand],
});
// ---cut---
const bunApp = await onBun(app);

const result = await bunApp.execCommand(['greet', 'world']);
console.log(result.exitCode); // 0 or 1
```

## Warmup Option

By default, `onBun()` uses eager initialization (`warmup: true`) — all controllers are resolved at startup.

For lazy initialization (controllers resolved on first request):

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
import { onBun } from '@zeltjs/adapter-bun';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp({ http: { controllers: [HelloController] } });
// ---cut---
const bunApp = await onBun(app, { warmup: false });
```

| Option | Behavior | Use Case |
|--------|----------|----------|
| `warmup: true` (default) | All controllers resolved at startup | Long-running servers |
| `warmup: false` | Controllers resolved on first request | Optimized cold starts |

## What's Next?

- [Controllers](../controllers) — Route handling and HTTP methods
- [Services](../services) — Business logic and dependency injection
- [Commands](../command) — CLI commands
