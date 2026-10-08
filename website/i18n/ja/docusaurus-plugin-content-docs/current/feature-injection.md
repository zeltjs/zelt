---
title: Feature の注入
---

# Feature の注入

DI 管理下の constructor またはフィールド初期化で `injectFeature()` を使うと、設定済み Feature をユーザーコードから操作できます。HTTP、command、scheduler、eventbus、独自 Feature に共通の仕組みです。

## コマンドから HTTP を起動する

```typescript
import {
  Command, Controller, Get, command, createApp, http, injectFeature,
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

@Command({ name: 'serve' })
class ServeCommand {
  constructor(private readonly server = injectFeature(web)) {}

  async run() {
    const listener = await this.server.listen({ port: 3000 });
    await listener.closed;
  }
}

const runtime = await onNode(createApp([command([ServeCommand]), web]));
const result = await runtime.commands.execCommand(['serve']);
```

注入だけでは待ち受けを開始しません。`listen()` は実際の待ち受けアドレス、繰り返し呼べる `shutdown()`、終了を待つ `closed` を返します。注入側・runtime の公開 API のどちらから起動したサーバーも、runtime の終了処理で閉じます。Node の SIGINT/SIGTERM による終了処理も適用されます。

Node と Bun は `listen()` の実装を提供します。通常の `createRuntime()` など、それ以外の環境での利用には `HttpServerAdaptor` の実装が必要です。実装がなければ呼び出し時に明示エラーになります。`fetch()` と `request()` は待ち受けなしで使えます。Bun の既存の公開 `serve()` API も維持しています。

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

名前を省略するとクラスの `static defaultKey` を使います。組み込みの値は `http`、`commands`、`schedulers`、`eventbus` です。最初の定義や唯一の名前付き定義を自動選択することはありません。独自クラスも `static readonly defaultKey` を定義できます。オブジェクト形式の独自 Feature は定義を直接指定できます。

対象はその runtime のトップレベルに登録されている必要があります。HTTP の `children` はルート合成の単位であり、自動では独立した注入対象になりません。同じオプションで作り直した別オブジェクトは登録済み定義と一致しません。名前の重複は従来どおり `createApp()` でエラーになります。

## 初期化と寿命

runtime は全 Feature の注入用参照を先に登録します。constructor では、まだ realize が終わっていない Feature への参照も保持できます。全 Feature の realize と、有効なら warmup によるインスタンス生成を済ませてから、ライフサイクルの startup を実行します。realize 中の `ServiceResolver.get()` はインスタンスを解決しますが、その時点で startup は実行しません。

constructor や `realize()` 中に注入先の操作を実行しないでください。全 Feature の準備前の操作は `FeatureInjectionError` の `not_ready` として失敗し、循環する初期化を待ち続けません。startup ではイベントの購読登録など、準備済みの操作を使えます。ただし互いの startup 完了を要求する循環までは解決しません。

注入用参照は公開 runtime API と同じ capabilities に委譲しますが、公開プロパティと `===` になる保証はありません。同じ runtime 内では同じ参照を返し、別 runtime の状態とは分離します。shutdown hook の実行中までは利用でき、runtime の終了後は事前に取り出したメソッドを含めてアクセスがエラーになります。未登録は `not_registered`、既定名のないクラスへの名前省略は `default_not_defined` です。

Feature 注入はアプリ全体の遅延初期化ではありません。バージョン表示だけのコマンドで待ち受けが始まることはありませんが、runtime を作れば realize と通常の startup は実行します。それらも避けたい場合は、runtime を作る前にバージョン表示を処理してください。
