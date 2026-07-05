---
sidebar_label: Overview
slug: /getting-started
---

# Getting Started

Zelt runs on Node.js, Bun, Cloudflare Workers, and more. Switching between environments is as simple as changing `onNode()` to `onBun()`.

## Packages

Zelt is split into focused packages. Here's where each function lives:

| Function | Package | Purpose |
|----------|---------|---------|
| `createApp`, `Controller`, `Get`, `Post`, `inject`, ... | `@zeltjs/core` | Framework core |
| `request()`, `request(schema)` | `@zeltjs/core` | Request access, body parsing, and Standard Schema validation |
| `onNode()` | `@zeltjs/adapter-node` | Node.js runtime adapter |
| `onBun()` | `@zeltjs/adapter-bun` | Bun runtime adapter |
| `onCloudflareWorkers()` | `@zeltjs/adapter-cloudflare-workers` | Workers adapter |
| `onLambda()` | `@zeltjs/adapter-lambda` | AWS Lambda adapter |
| `onElectron()` | `@zeltjs/adapter-electron` | Electron adapter |

Only `@zeltjs/core` and one adapter are required to get started.

## Choose Your Environment

- **[Node.js](./getting-started/node)** — The most common choice
- **[Bun](./getting-started/bun)** — Fast JavaScript runtime
- **[Cloudflare Workers](./getting-started/cloudflare-workers)** — Edge computing
- **[AWS Lambda](./getting-started/lambda)** — Serverless
- **[Electron](./getting-started/electron)** — Desktop apps
