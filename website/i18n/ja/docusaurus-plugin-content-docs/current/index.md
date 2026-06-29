# Introduction

ZeltJSは、DIを組み込んだポータブルなTypeScriptアプリケーションフレームワークです。アダプターを切り替えることで、Node.js、Bun、Cloudflare Workers、AWS Lambdaで動作します。
大規模なアプリケーションを、インフラを変えても動くように書けること。これがZeltJSの目指すところです。

## Philosophy

In TypeScript backend development, there are almost no true "frameworks." Hono and Express are excellent libraries, but they're not enough as application frameworks. Libraries are "convenient tools," but frameworks provide "answers to how to build applications." DI mechanisms, directory structure, integrated patterns for authentication, validation, and logging — only when these "answers to how to build" are in place can developers focus on essential feature development.

NestJS is one of the few that can be called a framework, but it brings in its own module system and RxJS-based abstractions, diverging from standard TypeScript conventions. Its heavy metadata analysis at startup also makes it impractical for serverless environments.

ZeltJS aims to be a "framework" where you don't have to wonder how to build your application.
To achieve this, we build with these five policies:

- TS-Native — Don't reinvent what TS already has. Use import/export, use async/await, use types
- Web-Standard — Align with web standards like Request/Response, Fetch API. No custom abstractions
- Transport-Agnostic — REST/GraphQL/CLI/Queue are just different entry points. The application core stays the same
- Cold-Start Friendly — Runs on serverless/Worker/Edge. No startup cost penalty
- Least Astonishment — Follow ecosystem standards. No extra learning cost

## Quick Example

```typescript
import { createApp, Controller, Get, http } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'Hello, World!' };
  }
}

const app = createApp([http({ controllers: [HelloController] })]);
const nodeApp = await onNode(app);
await nodeApp.http.listen({ port: 3000 });
```

## Benchmark

Zeltはランタイム性能とコールドスタート速度のバランスを実現 — サーバーレスに最適。

| Framework | Requests/sec | Cold Start (ms) |
| --------- | -----------: | --------------: |
| Fastify   |       44,033 |             101 |
| **Zelt**  |   **37,331** |          **68** |
| Hono      |       37,262 |              37 |
| AdonisJS  |       33,548 |             149 |
| NestJS    |       23,597 |             268 |

[ベンチマーク詳細 →](https://github.com/zeltjs/benchmarks)

## Status

**pre-alpha** — Breaking changes may occur in minor versions during 0.x.
