# @zeltjs/adapter-lambda

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

AWS Lambda adapter for Zelt applications.

## Installation

```bash
npm install @zeltjs/adapter-lambda @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Lambda!' };
  }
}

const app = createApp({
  http: { controllers: [HelloController] },
});

const lambda = await onLambda(app);

export const handler = lambda.handler;
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
