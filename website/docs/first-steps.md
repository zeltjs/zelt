---
sidebar_position: 2
---

# First Steps

In this guide, you'll learn the core fundamentals of Zelt. To get familiar with the essential building blocks, we'll build a basic CRUD application with features that cover the fundamentals.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher)
- A package manager: [pnpm](https://pnpm.io/) (recommended), npm, or bun

## Installation

```bash
pnpm add @zeltjs/core @zeltjs/adapter-node
```

## Creating a Simple Application

Let's create a simple "Hello World" application.

### Project Structure

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

### Step 1: Create the Controller

Controllers handle incoming requests and return responses. Create `src/controllers/hello.controller.ts`:

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

### Step 2: Create the Application

Create `src/app.ts` to wire up your controllers:

```typescript
import { createHttpApp } from '@zeltjs/core';
import { HelloController } from './controllers/hello.controller';

export const app = createHttpApp({
  controllers: [HelloController],
});
```

### Step 3: Start the Server

Create `src/main.ts` for the Node.js entry point:

```typescript
import { serve } from '@zeltjs/adapter-node';
import { app } from './app';

serve(app, { port: 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
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

## What's Next?

Now that you have a basic application running, learn more about:

- [Controllers](/controllers) — Handle HTTP requests
- [Services](/services) — Business logic and dependency injection
- [Validation](/validation) — Request body validation with Valibot
