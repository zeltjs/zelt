---
sidebar_label: 概要
slug: /getting-started
---

# はじめに

ZeltはNode.js、Bun、Cloudflare Workersなどの上で動作します。環境を切り替えるには、`onNode()` を `onBun()` に変更するだけです。

## パッケージ {#packages}

Zeltは目的別のパッケージに分割されています。各機能がどこにあるかは以下の通りです:

| 機能 | パッケージ | 用途 |
|----------|---------|---------|
| `createApp`, `Controller`, `Get`, `Post`, `inject`, ... | `@zeltjs/core` | フレームワークのコア |
| `request()`, `request(schema)` | `@zeltjs/core` | リクエストアクセス、ボディのパース、Standard Schemaバリデーション |
| `onNode()` | `@zeltjs/adapter-node` | Node.jsランタイムadapter |
| `onBun()` | `@zeltjs/adapter-bun` | Bunランタイムadapter |
| `onCloudflareWorkers()` | `@zeltjs/adapter-cloudflare-workers` | Workers adapter |
| `onLambda()` | `@zeltjs/adapter-lambda` | AWS Lambda adapter |
| `onElectron()` | `@zeltjs/adapter-electron` | Electron adapter |

始めるために必要なのは `@zeltjs/core` とadapterひとつだけです。

## 実行環境を選ぶ {#choose-your-environment}

- **[Node.js](./getting-started/node)** — 最も一般的な選択肢
- **[Bun](./getting-started/bun)** — 高速なJavaScriptランタイム
- **[Cloudflare Workers](./getting-started/cloudflare-workers)** — エッジコンピューティング
- **[AWS Lambda](./getting-started/lambda)** — サーバーレス
- **[Electron](./getting-started/electron)** — デスクトップアプリ
