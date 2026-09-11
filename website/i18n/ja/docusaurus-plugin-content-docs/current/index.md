# Introduction

ZeltJSは、一貫したバックエンド構造を必要としながら、アプリケーションのコアを
特定の実行環境に縛りたくないチームのためのTypeScriptアプリケーションフレームワークです。
コントローラー、サービス、設定などの機能を一度定義し、Node.js、Bun、Cloudflare
Workers、AWS Lambda、Electron、またはプロセス内テスト用のアダプターで同じアプリを
実行可能な状態にします。

:::caution[Pre-alpha]
ZeltJSは活発に開発中です。0.xの間はマイナーバージョンでAPIが変わる可能性があります。
調査・試用・フィードバックには利用できますが、安定したAPIと長期サポートが必須の
アプリケーションには、まだ保守的な選択肢ではありません。
:::

## Zeltが解決する問題 {#the-problem-zelt-addresses}

HTTPルーターを使えば、サービスをすぐに起動できます。しかしサービスが成長すると、
DI、設定、ライフサイクル、バリデーション、認証、ロギング、バックグラウンド処理、
テストをどう組み合わせるかもチームで決めなければなりません。これらはルーティングではなく、
アプリケーション設計の問題です。

Zeltは、そのアプリケーション層を提供しつつ、実行環境との境界を明示します。

- **アプリケーションのコアは振る舞いを記述します。** コントローラー、サービス、各機能は
  サーバーを起動せず、デプロイ先にも依存しません。
- **アダプターがアプリを実行可能にします。** 小さなエントリーファイルでNode.js、Bun、
  Workers、Lambda、Electron、またはテスト環境を選びます。
- **任意のプラグインが成果物を導出します。** OpenAPI文書、GraphQL実行用データ、
  型付きクライアントなどをアプリ定義から生成できます。

これは「実行環境固有のコードがゼロになる」という意味ではありません。エントリーファイルと
インフラ設定は各環境に必要です。Zeltの目的は、それらをアプリ全体へ広げず、境界部分に
留めることです。

## Zeltが適している場合 {#when-zelt-fits}

次のような場合はZeltを検討できます。

- ルーターだけでなく、フレームワークとしての構造と組み込みDIが必要
- 本番とプロセス内テストで同じアプリケーションのコアを動かしたい
- 同じ機能をNode.js、Bun、Workers、Lambda、Electronなどへデプロイする可能性がある
- HTTP、GraphQL、コマンド、スケジュールジョブなど、複数の入口から振る舞いを提供する
- OpenAPIや型付きクライアントなど、コードから導出される契約が必要

小さなHTTPハンドラーにルーターだけで十分な場合、アプリ全体を意図的に一つの実行環境へ
最適化する場合、または成熟したエコシステムと安定したAPIが今すぐ必要な本番システムには、
Zeltが適さない可能性があります。

## 設計原則 {#design-principles}

- **TypeScriptネイティブ** — 独自のモジュールシステムやリアクティブモデルではなく、
  module、async/await、型、標準decoratorを使う
- **HTTP境界ではWeb標準** — 独自のrequest/responseモデルではなく、`Request`、
  `Response`、Fetch APIを使う
- **持ち運べるアプリケーションコア** — 実行環境固有の起動処理とインフラを、
  アダプターや交換可能なサービスへ分離する
- **明示的な構成** — `createApp([...])` でコントローラーと機能を組み立て、
  アプリの形がコード上で見えるようにする
- **コールドスタートを意識** — serverlessやedge環境で使えるよう、起動時の処理を小さく保つ。
  測定条件と結果は[ベンチマーク](https://github.com/zeltjs/benchmarks)を参照

## 小さなアプリケーション {#a-small-application}

```typescript
import { Controller, Get, Injectable, createApp, http, inject } from '@zeltjs/core';

@Injectable()
class GreetingService {
  greet() {
    return 'Hello from ZeltJS!';
  }
}

@Controller('/')
class GreetingController {
  constructor(private greetings = inject(GreetingService)) {}

  @Get('/')
  hello() {
    return { message: this.greetings.greet() };
  }
}

export const app = createApp([http({ controllers: [GreetingController] })]);
```

アプリケーション自身は実行環境を選びません。Node.js用のエントリーは数行です。

```typescript
import { onNode } from '@zeltjs/adapter-node';
import { createApp, http } from '@zeltjs/core';
const app = createApp([http({ controllers: [] })]);
// ---cut---
// node.ts — appは./appからimport

const node = await onNode(app);
await node.http.listen(3000);
```

## 次に進む {#choose-your-next-step}

- [StackBlitzでZeltJSを試す](https://stackblitz.com/fork/github/zeltjs/zelt/tree/main/examples/stackblitz-node?startScript=dev&title=ZeltJS%20Quickstart) — ブラウザで小さなNode.jsアプリを実行・編集する
- [Getting Startedを進める](./getting-started) — ローカルへインストールし、実行環境を選ぶ
- [全体像を理解する](./big-picture) — アプリ定義、生成物、アダプター、実行環境の関係を見る
- [完成したサンプルを見る](https://github.com/zeltjs/zelt/tree/main/examples/drizzle-todo) — Drizzleとテストを使うバックエンドを確認する
