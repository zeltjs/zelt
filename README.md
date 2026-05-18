<p align="center">
  <img src="website/static/img/logo.svg" alt="ZeltJS" height="80">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zeltjs/core"><img src="https://img.shields.io/npm/v/@zeltjs/core.svg" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

ZeltJS is a portable TypeScript application framework with built-in DI. Swap adapters to run on Node.js, Bun, Cloudflare Workers, or AWS Lambda. Building large-scale applications that work across different infrastructure. That's what ZeltJS aims for.

📖 **Documentation**: [zeltjs.com](https://zeltjs.com)

## Installation

```bash
npm i @zeltjs/core @zeltjs/adapter-node
```

## Quick Example

```typescript
import { Controller, Get } from '@zeltjs/core';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello, World!' };
  }
}
```

## Benchmark

Zelt balances runtime performance with cold-start speed — ideal for serverless.

| Framework | Requests/sec | Cold Start (ms) |
| --------- | -----------: | --------------: |
| Fastify   |       44,033 |             101 |
| **Zelt**  |   **37,331** |          **68** |
| Hono      |       37,262 |              37 |
| AdonisJS  |       33,548 |             149 |
| NestJS    |       23,597 |             268 |

## License

MIT
