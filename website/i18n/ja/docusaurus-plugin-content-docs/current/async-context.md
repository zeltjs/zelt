---
---

# 実行コンテキスト

Zeltは`AsyncLocalStorage`（ALS）なしでも実行できます。リクエストアクセサとmiddleware値は、どちらの方式でも同じAPIを使います。

| HTTP入口での操作 | `sync` | `async` |
|---|---|---|
| デフォルト引数で`request()`・`response()`・`middlewareValue(M)`を取得 | 可能 | 可能 |
| 取得済みのアクセサや値を`await`後に利用 | 可能 | 可能 |
| middlewareが`await`後に`next(value)`を呼ぶ | 可能 | 可能 |
| `await`後にコンテキスト取得関数を直接呼ぶ | エラー | 可能 |

`sync`では、フレームワークがメソッドを呼んだときの同期実行区間だけ、暗黙のコンテキスト取得ができます。タイマーや`.then()`のコールバックも区間外です。上流middlewareが`await`してから`next`を呼んでも、下流middlewareやhandlerの呼び出し時には新しく注入区間を開きます。

## 方式の選択

coreの初期状態は`sync`で、Node組み込みモジュールをimportしません。非同期の暗黙伝播を使う場合は、別エントリからALSを有効にしてからruntimeを作成します。

```typescript
import { createApp, http } from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

enableAsyncContext();

const app = createApp([http({ controllers: [] })]);
const runtime = await app.createRuntime({ contextMode: 'async' });
```

`enableAsyncContext()`は複数回呼んでも同じ状態です。有効化後に作成するruntimeの既定値は`async`になります。既存runtimeの方式は変わりません。ALSが有効な環境でも、`contextMode: 'sync'`を明示したruntimeの暗黙取得は非同期区間へ延長されません。

Node・Bun・Lambda・ElectronアダプタはALSを有効にし、既定で`async`を選びます。各アダプタの`contextMode`で`sync`も選べます。Cloudflare WorkersアダプタはALSをimportせず、Zeltのcoreコンテキスト処理のための`nodejs_compat`・`nodejs_als`は不要です。アプリケーションの別の依存がこれらのフラグを必要とする場合はあります。

ALSを有効にせず`async`を指定すると、runtime作成時にエラーになります。自動で同期方式に切り替えて再実行はしません。

## 移植できるhandlerの書き方

フレームワークの入力は、呼び出し時に受け取ります。

```typescript
import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/users')
class UsersController {
  @Get('/:id')
  async find(req = request(), res = response()) {
    await Promise.resolve();
    return res.json({ id: req.pathParam('id') });
  }
}
```

`value = middlewareValue(MyMiddleware)`・`opts = middlewareOptions(MyMiddleware)`も同様です。reqはbodyキャッシュ・pathパラメータ・Hono Contextを保持します。middlewareは共有シングルトンのまま、引数と`next`が要求ごとの状態を保持します。保存した`next`を、そのmiddlewareの`use()`完了後に呼ぶことはできません。

後からコンテキストを読み書きする必要がある場合は、同期区間で実行ハンドルを捕捉します。

```typescript
import { captureContext, Controller, Get, request } from '@zeltjs/core';

@Controller('/example')
class ExampleController {
  @Get('/')
  async handle(req = request()) {
    const context = captureContext();
    await Promise.resolve();
    return context.run(() => ({ path: request().path(), method: req.method() }));
  }
}
```

`sync`で`context.run(async () => ...)`を使っても、暗黙取得ができるのはそのコールバックの最初の中断までです。必要な入力は`await`前に捕捉します。`setUser`・Sessionの更新関数・プラットフォームbindingの取得も同じ契約です。

## その他の機能

- ログ：`logger.child(bindings)`のbindingsは、両方式で`await`後も保持します。`withLogContext`の暗黙伝播が`await`を越えるのは`async`のみです。
- Task：`run()`・`runAndWait()`は両方式で使えます。`sync`では、実行中Taskがあると`shutdown()`が`TaskRunnerSynchronousShutdownError`になります。外部からの終了と、Task自身の終了待ちを区別できないためです。`runAndWait()`の完了後に終了するか、終了時のTask待機には`async`を使います。
- `afterResponse()`のTaskは、完了したリクエストのflush側スコープで実行します。登録時の一時的なstorageスコープ（DBトランザクションやログbindingsなど）は引き継ぎません。Taskに必要なデータやchild loggerは、handlerから戻る前に受け取っておきます。
- DB：自動トランザクション伝播には`async`が必要です。この変更でDBのトランザクション設計は変更していません。
- CLI・GraphQL：`args(...)`をメソッドのデフォルト引数で受け取ります。非同期のresolver解決後にも、呼び出し時の実行コンテキストを復元します。

移植性を確認するテストでは、`onTest`に`{ contextMode: 'sync' }`を渡します。`await`後の暗黙取得が必要なテストは、setupで`enableAsyncContext()`を呼べます。
