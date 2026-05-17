---
sidebar_label: AWS Lambda
---

# Getting Started with AWS Lambda

This guide walks you through building a Zelt application on AWS Lambda from scratch.

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- An [AWS account](https://aws.amazon.com/)
- [AWS CLI](https://aws.amazon.com/cli/) or [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

## Installation

```bash
pnpm add @zeltjs/core @zeltjs/adapter-lambda
pnpm add -D @types/aws-lambda esbuild
```

## Project Structure

```
my-lambda/
├── src/
│   ├── app.ts
│   ├── handler.ts
│   └── controllers/
│       └── hello.controller.ts
├── package.json
├── tsconfig.json
└── template.yaml
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

### Step 3: Create the Lambda Handler

Create `src/handler.ts`:

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp({ http: { controllers: [HelloController] } });
// ---cut---
const lambdaApp = await onLambda(app);

export const handler = lambdaApp.handler;
```

The `onLambda()` function prepares your app for the Lambda runtime. It returns:

- `handler` — API Gateway v2 (HTTP API) handler
- `handlerV1` — API Gateway v1 (REST API) handler
- `shutdown()` — Gracefully shuts down the application
- `get<T>(Class)` — Resolves a service from the DI container

### Step 4: Configure SAM Template

Create `template.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    Runtime: nodejs20.x

Resources:
  HelloFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/
      Handler: handler.handler
      Events:
        Api:
          Type: HttpApi
          Properties:
            Path: /{proxy+}
            Method: ANY
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: es2022
        EntryPoints:
          - src/handler.ts

Outputs:
  ApiEndpoint:
    Value: !Sub "https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
```

### Step 5: Deploy

```bash
sam build
sam deploy --guided
```

## API Gateway Versions

The adapter supports both API Gateway versions:

### HTTP API (v2) — Recommended

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp({ http: { controllers: [HelloController] } });
const lambdaApp = await onLambda(app);
// ---cut---
export const handler = lambdaApp.handler;
```

### REST API (v1)

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp({ http: { controllers: [HelloController] } });
const lambdaApp = await onLambda(app);
// ---cut---
export const handler = lambdaApp.handlerV1;
```

## Warmup Option

By default, `onLambda()` uses lazy initialization (`warmup: false`) to minimize cold start time. Controllers are resolved on the first request.

For eager initialization:

```typescript
// @noErrors
import { createApp, Controller, Get, pathParam } from '@zeltjs/core';
import { onLambda } from '@zeltjs/adapter-lambda';

@Controller('/hello')
class HelloController {
  @Get('/:name')
  greet(name = pathParam('name')) { return { message: `Hello, ${name}!` }; }
}

const app = createApp({ http: { controllers: [HelloController] } });
// ---cut---
const lambdaApp = await onLambda(app, { warmup: true });
```

| Option | Behavior | Use Case |
|--------|----------|----------|
| `warmup: false` (default) | Controllers resolved on first request | Optimized cold starts |
| `warmup: true` | All controllers resolved at initialization | Provisioned concurrency |

## Binary Responses

The adapter automatically handles binary responses (images, audio, video, octet-stream) by encoding them as base64.

```typescript
// @noErrors
import { Controller, Get, response } from '@zeltjs/core';
// ---cut---
@Controller('/files')
export class FileController {
  @Get('/image')
  getImage() {
    const imageBuffer = new Uint8Array([/* ... */]);
    return response()
      .header('Content-Type', 'image/png')
      .body(imageBuffer);
  }
}
```

## What's Next?

- [Controllers](../controllers) — Route handling and HTTP methods
- [Services](../services) — Business logic and dependency injection
- [Configuration](../configuration) — Environment variables and secrets
