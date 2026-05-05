# @zeltjs/core

The core framework for building type-safe HTTP APIs with decorators and dependency injection.

## Installation

```bash
npm install @zeltjs/core
```

## Quick Start

```typescript
import { Controller, Get, createHttpApp } from '@zeltjs/core';

@Controller('/hello')
class HelloController {
  @Get('/')
  hello() {
    return { message: 'Hello, World!' };
  }
}

const app = createHttpApp({ controllers: [HelloController] });
```

## Documentation

See [zeltjs.dev](https://zeltjs.dev) for full documentation.
