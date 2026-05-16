---
slug: /
---

# Introduction

ZeltJS is a portable TypeScript application framework with built-in DI. Swap adapters to run on Node.js, Bun, Cloudflare Workers, or AWS Lambda.
Building large-scale applications that work across different infrastructure. That's what ZeltJS aims for.

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

## Status

**pre-alpha** — Breaking changes may occur in minor versions during 0.x.
