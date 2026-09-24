# はじめに

ZeltJSは、DIを備えたTypeScriptバックエンドフレームワークです。コントローラー、
サービス、設定などのアプリコードと、サーバーの起動処理を分けて記述します。
Node.js、Bun、Cloudflare Workers、AWS Lambda、Electron、プロセス内テスト用の
アダプターを提供しています。

:::caution[Pre-alpha]
ZeltJSは活発に開発中です。0.xの間はマイナーバージョンでAPIが変わる可能性があります。
安定したAPIや長期サポートが必要なプロジェクトでは、安定版のリリースを待ってください。
:::

## ZeltJSが提供するもの {#the-problem-zelt-addresses}

HTTPルーターを使えば、サービスをすぐに起動できます。しかしサービスが成長すると、
DI、設定、ライフサイクル、バリデーション、認証、ロギング、バックグラウンド処理、
テストをどう組み合わせるかもチームで決めなければなりません。これらはルーティングではなく、
アプリケーション設計の問題です。

ZeltJSはこれらの機能を提供し、実行環境ごとの起動処理と分けて扱います。

- **アプリ定義:** コントローラー、サービス、各機能
- **実行環境のエントリー:** アダプターを使ってNode.js、Bun、Workers、Lambda、
  Electron、テスト環境でアプリを起動
- **生成ファイル:** 任意のプラグインがアプリ定義からOpenAPI文書、GraphQL実行用
  データ、型付きクライアントを生成

エントリーファイルとインフラ設定は実行環境ごとに必要です。コントローラー、サービス、
ビジネスルールとは分けて記述します。

## 想定するユースケース {#when-zelt-fits}

ZeltJSは次のようなアプリを対象としています。

- DIとライフサイクル管理が必要
- 本番とプロセス内テストで同じアプリ定義を使う
- Node.js、Bun、Workers、Lambda、Electronのいずれかで実行する
- HTTP、GraphQL、コマンド、スケジュールジョブなど、複数の入口から振る舞いを提供する
- アプリのmetadataからOpenAPI文書や型付きクライアントを生成する

ルーティングだけが必要な小さなHTTPハンドラーには、ルーターで十分です。安定したAPIと
長期サポートが必要な本番システムにも、現時点のZeltJSは適していません。

## 設計原則 {#design-principles}

- **TypeScript API** — module、async/await、型、標準decoratorを使う
- **HTTPにWeb標準APIを使用** — `Request`、`Response`、Fetch APIを使う
- **起動処理を分離** — 実行環境固有の処理とインフラを、アダプターや差し替え可能な
  サービスに置く
- **明示的な構成** — `createApp([...])` でコントローラーと機能を組み立て、
  アプリ定義をコード上で確認できるようにする
- **起動時間を測定** — ベンチマークでスループットとコールドスタート時間を公開する。
  [測定方法と結果](https://github.com/zeltjs/benchmarks)を参照

## コード例 {#a-small-application}

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

アプリ定義はサーバーを起動しません。Node.js用のエントリーで起動します。

```typescript
import { onNode } from '@zeltjs/adapter-node';
import { createApp, http } from '@zeltjs/core';
const app = createApp([http({ controllers: [] })]);
// ---cut---
// node.ts — appは./appからimport

const node = await onNode(app);
await node.http.listen(3000);
```

## 次に読むもの {#choose-your-next-step}

- [StackBlitzでZeltJSを試す](https://stackblitz.com/fork/github/zeltjs/zelt/tree/main/examples/stackblitz-node?startScript=dev&title=ZeltJS%20Quickstart) — ブラウザで小さなNode.jsアプリを実行・編集する
- [Getting Startedを進める](./getting-started) — ローカルへインストールし、実行環境を選ぶ
- [アーキテクチャの概要を読む](./big-picture) — アプリ定義、生成物、アダプター、実行環境の関係を確認する
- [完成したサンプルを見る](https://github.com/zeltjs/zelt/tree/main/examples/drizzle-todo) — Drizzleとテストを使うバックエンドを確認する
