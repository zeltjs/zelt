# @zeltjs/adapter-lambda

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

AWS Lambda adapter for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/adapter-lambda @zeltjs/core
```

## Usage

```typescript
import { createApp, http, Controller, Get } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Lambda!' };
  }
}

const app = createApp([http({ controllers: [HelloController] })]);

const lambdaApp = await onLambda(app);

export const handler = lambdaApp.handler;
```
