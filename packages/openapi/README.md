# @zeltjs/openapi

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

OpenAPI schema generator for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/openapi
```

## Usage

### CLI

```bash
npx zelt-openapi generate --config zelt.config.ts
```

### Programmatic

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { generateOpenApi } from '@zeltjs/openapi';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello!' };
  }
}

const app = createApp({ controllers: [HelloController] });
const result = await generateOpenApi(app, { distDir: './dist', info: { title: 'API', version: '1.0.0' } });
console.log(result);
```
