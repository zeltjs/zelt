# Introduction

ZeltJSは、DIを組み込んだポータブルなTypeScriptアプリケーションフレームワークです。アダプターを切り替えることで、Node.js、Bun、Cloudflare Workers、AWS Lambdaで動作します。
異なるインフラで動作する大規模なアプリケーションを構築すること。それがZeltJSの目指すところです。

## 設計思想 {#philosophy}

TypeScriptによるバックエンド開発には、真の意味での「フレームワーク」がほとんど存在しません。HonoやExpressは優れたライブラリですが、アプリケーションフレームワークとしては不十分です。ライブラリは「便利な道具」ですが、フレームワークは「アプリケーションをどう構築するかへの答え」を提供します。DIの仕組み、ディレクトリ構造、認証・バリデーション・ロギングの統合パターン — これら「構築方法への答え」が揃って初めて、開発者は本質的な機能開発に集中できます。

NestJSはフレームワークと呼べる数少ない存在ですが、独自のモジュールシステムとRxJSベースの抽象化を持ち込むため、標準的なTypeScriptの慣習から外れます。起動時の重いメタデータ解析も、サーバーレス環境では非実用的です。

ZeltJSは、アプリケーションの構築方法に悩まなくて済む「フレームワーク」を目指しています。
そのために、次の5つの方針で構築しています:

- TS-Native — TSがすでに持っているものを再発明しない。import/exportを使い、async/awaitを使い、typesを使う
- Web-Standard — Request/Response、Fetch APIなどWeb標準に沿う。独自の抽象化はしない
- Transport-Agnostic — REST/GraphQL/CLI/Queueは単なる異なるエントリポイントに過ぎない。アプリケーションのコアは変わらない
- Cold-Start Friendly — serverless/Worker/Edgeで動作する。起動コストのペナルティなし
- Least Astonishment — エコシステムの標準に従う。追加の学習コストなし

## インストール {#installation}

```bash
pnpm add @zeltjs/core @zeltjs/adapter-node
```

:::note
Zeltは**pre-alpha**です — マイナーバージョン間でAPIが変わることがあります。
:::

## クイックサンプル {#quick-example}

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

順を追った説明は[Getting Started](./getting-started)ガイドを参照してください。

## ベンチマーク {#benchmark}

Zeltはランタイム性能とコールドスタート速度のバランスを実現 — サーバーレスに最適です。

| Framework | Requests/sec | Cold Start (ms) |
| --------- | -----------: | --------------: |
| Fastify   |       44,033 |             101 |
| **Zelt**  |   **37,331** |          **68** |
| Hono      |       37,262 |              37 |
| AdonisJS  |       33,548 |             149 |
| NestJS    |       23,597 |             268 |

[ベンチマーク詳細 →](https://github.com/zeltjs/benchmarks)

## ステータス {#status}

**pre-alpha** — 0.xの間はマイナーバージョンで破壊的変更が発生することがあります。
