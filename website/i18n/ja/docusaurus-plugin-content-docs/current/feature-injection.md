---
title: Feature の注入
---

# Feature の注入

DI 管理下の constructor またはフィールド初期化で `injectFeature()` を使うと、設定済み Feature をユーザーコードから操作できます。HTTP、command、scheduler、eventbus、独自 Feature に共通の仕組みです。

## コマンドから HTTP を起動する

```typescript
import {
  Command, Controller, Get, command, createApp, http, httpServer, injectFeature,
} from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
// ---cut---
@Controller('/')
class HelloController {
  @Get('/')
  hello() {
    return { message: 'Hello' };
  }
}

const web = http({ controllers: [HelloController] });
const listener = httpServer();

@Command({ name: 'serve' })
class ServeCommand {
  constructor(
    private readonly http = injectFeature(web),
    private readonly server = injectFeature(listener),
  ) {}

  async run() {
    const listener = await this.server.listen(this.http, { port: 3000 });
    await listener.closed;
  }
}

const runtime = await onNode(createApp([command([ServeCommand]), web, listener]));
const result = await runtime.command.execCommand(['serve']);
```

注入だけでは待ち受けを開始しません。`listen()` は実際の待ち受けアドレス、繰り返し呼べる `shutdown()`、終了を待つ `closed` を返します。注入側・runtime の公開 API のどちらから起動したサーバーも、runtime の終了処理で閉じます。Node の SIGINT/SIGTERM による終了処理も適用されます。

待ち受けには `httpServer()` を宣言します。Node・Bun・txiki.js・Electronが環境実装を提供し、実装のない環境ではserver featureの初期化時にエラーになります。HTTPの `fetch()` と `request()` はserver featureなしで利用でき、従来のHTTP上の `listen()` / `serve()` は廃止します。

## 対象を選ぶ

`createApp()` に登録した定義オブジェクトそのものを渡します。

```typescript
import { Injectable, http, injectFeature } from '@zeltjs/core';
const admin = http({ name: 'admin', controllers: [] });
const user = http({ name: 'user', controllers: [] });
// ---cut---
@Injectable()
class Servers {
  private readonly admin = injectFeature(admin);
  private readonly user = injectFeature(user);
}
```

クラス形式の Feature では、種類と名前でも指定できます。

```typescript
import {
  Injectable, HttpFeature, CommandFeature, SchedulerFeature, injectFeature,
} from '@zeltjs/core';
import { EventBusFeature } from '@zeltjs/eventbus';
// ---cut---
@Injectable()
class FeatureConsumer {
  private readonly http = injectFeature(HttpFeature);
  private readonly admin = injectFeature(HttpFeature, 'admin');
  private readonly commands = injectFeature(CommandFeature);
  private readonly scheduler = injectFeature(SchedulerFeature);
  private readonly events = injectFeature(EventBusFeature);
}
```

名前を省略するとクラスの `static defaultKey` を使います。既定名は生成関数名と一致し、`http`、`httpServer`、`command`、`scheduler`、`eventbus`、`tinyjsBridge`、`electronIpc`、`lambdaHandler` です。最初の定義や唯一の名前付き定義を自動選択することはありません。独自クラスも `static readonly defaultKey` を定義できます。オブジェクト形式の独自 Feature は定義を直接指定できます。

対象はその runtime のトップレベルに登録されている必要があります。HTTP の `children` はルート合成の単位であり、自動では独立した注入対象になりません。同じオプションで作り直した別オブジェクトは登録済み定義と一致しません。名前の重複は従来どおり `createApp()` でエラーになります。

feature名には、`@zeltjs/core`が公開する`RESERVED_APP_KEYS`の予約語を使えません。全adapterで共通の一覧に、`shutdown`、`get`などの組み込み操作と、`args`などの環境側の公開名をまとめています。名前付きfeatureのfactoryは予約名を型で拒否し、独自featureのキーも`createApp()`で検査します。組み込みAPIの型定義は`ReservedAppProperties`を使い、一覧にないproperty／methodの追加も型エラーにします。JavaScriptや動的な名前も、アプリ生成時に同じ一覧で検査します。

名前は Feature の capabilities を選ぶためのキーです。DI コンテナーや内部のサービスを分離するものではありません。たとえば同じアダプタークラスを指定した名前付き EventBus は、その runtime のアダプターとイベント・購読を共有します。アダプターを直接注入したコードとも連携でき、別 runtime のインスタンスとは分離します。独立したバスが必要な場合はアダプターと接続先・チャンネルの分離を明示的に構成してください。`name` を変えるだけではバスは分離されません。

## 初期化と寿命

runtime は全 Feature の注入用参照を先に登録します。constructor では、まだ realize が終わっていない Feature への参照も保持できます。まず `configs` に明示した設定を生成し、そのリソースの startup を完了させます。これにより Feature の constructor は startup で準備された設定値を読み取れます。その後、全 Feature の realize と、有効なら warmup によるインスタンス生成を済ませてから、Feature のライフサイクルの startup を実行します。realize 中の `ServiceResolver.get()` はインスタンスを解決しますが、その時点でそのインスタンスの startup は実行しません。

constructor、設定の startup、`realize()` 中に注入先の操作を実行しないでください。全 Feature の準備前の操作は `FeatureInjectionError` の `not_ready` として失敗し、循環する初期化を待ち続けません。Feature の startup ではイベントの購読登録など、準備済みの操作を使えます。ただし互いの startup 完了を要求する循環までは解決しません。

注入用参照は公開 runtime API と同じ capabilities に委譲しますが、公開プロパティと `===` になる保証はありません。同じ runtime 内では同じ参照を返し、別 runtime の状態とは分離します。shutdown hook の実行中までは利用でき、runtime の終了後は事前に取り出したメソッドを含めてアクセスがエラーになります。未登録は `not_registered`、既定名のないクラスへの名前省略は `default_not_defined` です。

`http.router` のようなオブジェクト型のプロパティも、別の変数へ保存した後まで同じ寿命チェックが適用されます。注入用参照の内部では、同じ対象への複数の参照や循環参照も同一性を保ちます。HTTP レスポンスやサーバーハンドルなど、操作の戻り値にはそれぞれのリソースの契約が適用されます。

Feature 注入はアプリ全体の遅延初期化ではありません。バージョン表示だけのコマンドで待ち受けが始まることはありませんが、runtime を作れば realize と通常の startup は実行します。それらも避けたい場合は、runtime を作る前にバージョン表示を処理してください。

公開されたruntimeの名前空間と `injectFeature()` は同じ寿命検査handleを共有し、どちらもruntime終了後のアクセスを拒否します。

## runtimeの終了

adapterはruntime共通の `shutdown()` を使います。同時に複数回呼んでも、同じ終了完了を待ち、同じ失敗を受け取ります。SIGINT/SIGTERMもこの操作を呼ぶため、シグナルを繰り返し受けても終了処理を重複して開始しません。

`runtime.registerShutdown(callback)` はサービスのライフサイクル終了前に行う後片付けを登録します。シグナルハンドラーの解除など、サービス終了後に行う処理には `runtime.registerShutdown(callback, { phase: 'after' })` を使います。同じphase内の処理は並行して実行し、それぞれ最大1回だけ実行します。一部が失敗しても残りの後片付けを進め、エラーをまとめて返します。ライフサイクルの終了処理が失敗した場合もafterの処理は実行します。

ライフサイクルの検査で破棄前に終了を拒否された場合、runtimeは引き続き利用でき、終了を再試行できます。afterの処理は実際に破棄されるまで登録を維持します。終了を要求した時点から新しい仕事を拒否する連携では、DIまたは `runtime.get()` で取得できる `RuntimeShutdownService` の共通状態 `state`（`ready`、`shuttingDown`、`disposed`）を参照できます。
