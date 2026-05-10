# zeltjs

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

> Edge/serverless 時代のための、Laravel/FuelPHP 的な型安全 TypeScript アプリケーションフレームワーク。
>
> A fast, type-safe application framework for TypeScript, bringing Laravel/FuelPHP-like productivity to edge and serverless runtimes.

## Core values

- **Fast** — Cloudflare Workers / serverless cold start で実用的な起動・実行速度
- **Type-safe** — schema → request → controller → response → DI → test double が同一の型契約でつながる
- **Application-oriented** — controller / service / repository / config / lifecycle / error handling / testing / CLI/worker を統合した「アプリケーションの骨格」を提供

## Status

**pre-alpha**. 0.x の間は minor で破壊的変更を許容します。

## Packages

- `@zeltjs/core` — DI / lifecycle / validation / error / HTTP の中核
- `@zeltjs/adapter-node` — Node.js 用 listen
- `@zeltjs/testing` — テストユーティリティ
- `@zeltjs/openapi` — OpenAPI / 型生成ツール

Workers / Lambda 用アダプタは `@zeltjs/core` の subpath (`@zeltjs/core/workers`, `@zeltjs/core/lambda`) として提供予定です。

## License

MIT
