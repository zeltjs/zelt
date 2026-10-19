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
import { lambdaHandler, onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello from Lambda!' };
  }
}

const app = createApp([http({ controllers: [HelloController] }), lambdaHandler()]);

const lambdaApp = await onLambda(app);

export const handler = lambdaApp.lambdaHandler.create(lambdaApp.http);
```

`onLambda()` injects environment configs and initializes the declared features without adding a handler automatically. `lambdaHandler()` provides `lambdaHandler.create(targetHttp)`, which returns an API Gateway v2 handler by default.

For API Gateway v1, use:

```typescript
export const handler = lambdaApp.lambdaHandler.create(lambdaApp.http, { payloadFormat: '1.0' });
```

Use `lambdaHandler({ name: 'gateway' })` for a custom namespace. The target HTTP feature is always explicit, so one handler feature can connect multiple named HTTP features independently.
