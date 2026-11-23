# @zeltjs/drizzle-repository

drizzleの`schema.ts`から、domain単位で読み書きするRepositoryと、そのmodelの型を生成するZeltJSのpluginである。

生成したRepositoryは、キーで読むメソッドと、`save`・`delete`だけを持つ。存在を確認したIDを型で区別するので、確認していないIDで読むコードや、存在しない行を指したまま保存するコードは、型検査で止まる。

## インストール

```bash
npm install @zeltjs/drizzle-repository @zeltjs/db drizzle-metadata neverthrow
npm install -D @zeltjs/cli
```

`@zeltjs/core`、`@zeltjs/cli`、`drizzle-orm`はpeer dependencyである。`drizzle-orm`は`0.45.x`と、`1.0.0-rc.5`以降の`1.x`に対応する。

対応するDBは、SQLite・PostgreSQL・MySQLである。

## 使い方の流れ

1. どのtableを1つのdomainにするかを設計する。
2. `schema.ts`にtableと関連を書き、metadataを付ける。
3. `zelt.config.ts`にpluginを登録し、生成する。
4. 生成された基底をDIで受け取り、アプリのRepositoryを書く。

## domainを設計する

domainは、DBに対して1度に読み書きする単位である。1つのdomainは、1個以上のtableでできている。

- 複数のtableを1つのdomainにするのは、それらを**必ず**同時に取得する場合だけである。
  - 注文と注文明細を必ず同時に取得するなら、2つで1つのdomainである。
  - 注文の一覧では明細が要らないなら、注文と注文明細は別のdomainである。
- 1回の保存が全部成功か全部失敗になるのは、1つのdomainの中だけである。同時に書かないと壊れるtableは、同じdomainにする。
- どこまでを1つのdomainにするかは、設計する人が決める。生成器は判定しない。

## schemaを書く

table・キー・関連は、drizzleの書き方でそのまま書く。drizzleにない情報は、`drizzle-metadata`の`.meta()`で書く。

```ts
// src/db/schema.ts
import "drizzle-metadata/register";
import "@zeltjs/drizzle-repository/metadata";

export const order = sqliteTable("order", {
  id: text().primaryKey(),
  customer_id: text().notNull().references(() => customer.id),
  revision: integer().notNull().default(0).meta({ optimisticLock: true }),
  created_at: integer().notNull().default(sql`(unixepoch())`).meta({ excludedFromModel: true }),
});

export const orderItem = sqliteTable("order_item", {
  id: text().primaryKey(),
  order_id: text().notNull().references(() => order.id),
  name: text().notNull(),
});
```

関連は、使っているdrizzleの版の書き方で書く。

```ts
// drizzle 0.45.x
export const orderRelations = relations(order, ({ many }) => ({
  items: many(orderItem).meta({ includedInDomain: true }),
}));
```

```ts
// drizzle 1.x
export const schemaRelations = defineRelations({ order, orderItem }, (r) => ({
  order: {
    items: r.many.orderItem().meta({ includedInDomain: true }),
  },
}));
```

注文と注文明細を1つのdomainにした例である。

`@zeltjs/drizzle-repository/metadata`をimportすると、下のmetadataのkeyが`.meta()`の型に加わる。

### metadata

| 対象 | metadata | 意味 |
|---|---|---|
| 関連 | `includedInDomain: true` | 関連の先のtableを、このtableと同じdomainに入れる |
| 列 | `excludedFromModel: true` | DBだけが使う列である。modelに含めない |
| 列 | `optimisticLock: true` | 楽観ロックに使う列である。数値の列にだけ付けられる |

### 同じdomainに入れるtable

- `includedInDomain`を付けた関連の先の行は、modelの項目に配列で入る。上の例では`order.items`である。
- 項目の名前は関連のkeyである。table名とは別の名前を付けられる。
- `includedInDomain`のない関連は、modelに含まれない。
- どの関連からも`includedInDomain`で指されていないtableが、domainの起点になる。Repositoryは起点ごとに1つ生成される。

### modelに含めない列

`excludedFromModel`を付けた列は、modelに現れない。作成のときはDBの既定値が入り、更新のときはDBの値がそのまま残る。作成日時や更新日時に使う。

### 列の値の型

modelの項目の型は、drizzleの列の型と同じである。このpluginは値を変換しない。

DBの値とJSの値の変換は、drizzleの列定義で書く。日時なら`integer({ mode: "timestamp" })`、独自の変換なら`customType`を使う。

## 生成する

`zelt.config.ts`にpluginを登録する。

```ts
// zelt.config.ts
import { defineConfig } from "@zeltjs/cli";
import { drizzleRepositoryPlugin } from "@zeltjs/drizzle-repository";

export default defineConfig({
  app: () => import("./src/app").then((m) => m.app),
  plugins: [
    drizzleRepositoryPlugin({
      schema: "./src/db/schema.ts",
      database: { from: "./src/db/drizzle.service.ts", name: "DrizzleService" },
      out: {
        model: "./src/domain/generated",
        repository: "./src/db/generated",
      },
    }),
  ],
});
```

| 項目 | 意味 |
|---|---|
| `schema` | tableと関連をexportしているファイル。配列で複数書ける |
| `database` | `@zeltjs/db`の`DatabaseService`を継承したclassと、それをexportしているファイル。生成されたRepositoryは、このclassの`client`で読み書きする |
| `out.model` | modelの型を出力するフォルダ |
| `out.repository` | Repositoryを出力するフォルダ |

`database`のclassの`client`は、drizzleにschemaを渡して作る。生成されたRepositoryは、domainをdrizzleの`db.query`で1回の問い合わせで読むためである。

```ts
// drizzle 0.45.x
drizzle(connection, { schema });

// drizzle 1.x
drizzle({ client: connection, relations });
```

`zelt build`と`zelt dev`の前に、生成が行われる。生成だけをするときは、次のコマンドを使う。

```bash
npx zelt-drizzle-repository generate --config zelt.config.ts
```

生成したファイルは編集しない。`schema.ts`を変えたら、もう一度生成する。

生成物が`schema.ts`と合っているかを確かめるには、`--check`を付ける。合っていなければ失敗する。ファイルは書き換えない。CIで使う。

```bash
npx zelt-drizzle-repository generate --config zelt.config.ts --check
```

## 生成されるもの

tableを`user`という名前でexportした場合を例にする。型の名前は、exportした名前をUpperCamelCaseにして作る。`orderItem`なら`OrderItem`になる。単数形と複数形の変換はしない。

### 型

| 型 | 意味 |
|---|---|
| `UserId` | 外から受け取っただけのID。その行があるとは限らない |
| `UserExistedId` | 存在を確認したID |
| `User` | model。`id`は`UserExistedId`である |
| `NewUser` | 新しく作るときの型。`User`の`id`を`UserId`に置き換えたもの |

- 他のdomainを指すIDは、確認した後のIDである。`User`が`tenant_id`を持つなら、その型は`TenantExistedId`になる。
- 型は、Repositoryとは別のファイルに出力される。`schema.ts`を`import type`で参照するだけなので、実行時にdrizzleを読み込まない。

### Repository

`UserRepositoryBase`という`@Injectable()`のclassが生成される。

```ts
isExisted(id: UserId): ResultAsync<UserExistedId | NOT_EXIST, DbError>
getById(id: UserExistedId): ResultAsync<User, EntityNotFoundError | DbError>

isExistedBy<一意キー>(key): ResultAsync<{ id: UserExistedId } | { id: NOT_EXIST, ...key }, DbError>

findBy<外部キー>(key): ResultAsync<User[], DbError>

save({ pre, input }): ResultAsync<User, ConflictError | DbError>
delete(model: User): ResultAsync<void, ConflictError | DbError>
```

戻り値はneverthrowの`ResultAsync`である。例外は投げない。DBの失敗も`ResultAsync`で返る。

メソッドは、`schema.ts`のキーから決まる。

| キー | 生成されるメソッド | 引数 |
|---|---|---|
| 主キー | `isExisted`、`getById` | IDの値 |
| 一意キー | `isExistedBySlug`のように、列の組ごとの名前 | 1列なら値。複数列なら、全部の列を持つオブジェクト |
| 外部キー | `findByProductId`のように、列の組ごとの名前 | 確認した後のID |

同じ列の組が一意キーでも外部キーでもあるときは、一意キーとして扱う。

## アプリのRepositoryを書く

生成された基底は、そのまま使わない。アプリのRepositoryが基底を`inject()`で受け取り、使うメソッドだけを公開する。

```ts
// src/user/user.query.repository.ts
@Injectable()
export class UserQueryRepository {
  private readonly base = inject(UserRepositoryBase);
  public isExisted = this.base.isExisted.bind(this.base);
  public getById = this.base.getById.bind(this.base);
  public isExistedByEmail = this.base.isExistedByEmail.bind(this.base);
}

// src/user/user.command.repository.ts
@Injectable()
export class UserCommandRepository {
  private readonly base = inject(UserRepositoryBase);
  public save = this.base.save.bind(this.base);
  public delete = this.base.delete.bind(this.base);
}
```

- 読み取り用と書き込み用に分ける。読み取り用は`save`と`delete`を公開しない。
- 基底を継承しない。継承すると、全部のメソッドが公開される。

## 読む

### IDで読む

存在を確認してから読む。`getById`は確認した後のIDしか受け取らない。

```ts
const existed = await this.users.isExisted(input.user_id);
if (existed.isErr()) return err(existed.error);
if (existed.value === NOT_EXIST) return rejected("not_found");

const user = await this.users.getById(existed.value);
```

- `isExisted`は、行があれば確認した後のIDを返し、なければ`NOT_EXIST`を返す。行がないことはエラーではない。
- `getById`は、行があることを前提にする。行がなければ`EntityNotFoundError`を返す。

### 一意キーで確かめる

`isExistedBy<一意キー>`は、あるかないかを、確認した結果の型で返す。

```ts
const checked = await this.users.isExistedByEmail(input.email);
if (checked.isErr()) return err(checked.error);

if (checked.value.id === NOT_EXIST) {
  // checked.value は { id: NOT_EXIST, email }。このemailの行がないことを確認した値である
} else {
  // checked.value.id は UserExistedId。getById に渡せる
}
```

- 一意キーで読むメソッドはない。返ってきたIDを`getById`に渡して読む。
- 更新のときに自分自身と重複していないかは、返ってきた`id`を自分の`id`と比べて判断する。

### 外部キーで読む

`findBy<外部キー>`は、modelの配列を返す。

### 読み取りの決まり

- 必ず完全なmodelが返る。同じdomainに入れたtableの行も、一緒に返る。
- 列を選んで読むことや、関連を選んで含めることはできない。
- 1つのdomainの取得は、1回の問い合わせで行われる。

## 書く

### 作成する

`save`の`pre`に`null`を渡すと、作成になる。`input`には、新しく作るときの型`NewUser`を渡す。

```ts
const created = await this.userCommands.save({
  pre: null,
  input: { id: newUserId(), name: "Alice", email },
});
if (created.isErr()) return err(created.error);

// created.value は User。id は UserExistedId になっている
```

### 更新する

読んだmodelを`pre`に、変えた後のmodelを`input`に渡す。

```ts
const user = await this.users.getById(userExistedId);
if (user.isErr()) return err(user.error);

const saved = await this.userCommands.save({
  pre: user.value,
  input: { ...user.value, name: "Bob" },
});
if (saved.isErr()) return err(saved.error);
```

- `input`は完全なmodelである。一部の項目だけを渡すことはできない。
- 複数のtableからなるdomainでは、`pre`と`input`を行ごとに比べ、変わった行だけが書かれる。`input`で増えた行は追加され、減った行は削除される。

```ts
const order = await this.orders.getById(orderExistedId);
if (order.isErr()) return err(order.error);

// 明細Bの名前だけを変え、明細Dを足し、明細Cを除く
const input = {
  ...order.value,
  items: [
    ...order.value.items
      .filter((item) => item.id !== itemC)
      .map((item) => (item.id === itemB ? { ...item, name: "新しい名前" } : item)),
    { id: newOrderItemId(), order_id: order.value.id, name: "D" },
  ],
};

const saved = await this.orderCommands.save({ pre: order.value, input });
// 明細Bの更新、明細Dの追加、明細Cの削除だけが書かれる
```

### 削除する

読んだmodelを渡す。同じdomainに入れたtableの行も、一緒に削除される。

`optimisticLock`の列がないdomainで、行がすでにないときは、何もせずに成功する。

```ts
const user = await this.users.getById(userExistedId);
if (user.isErr()) return err(user.error);

const deleted = await this.userCommands.delete(user.value);
if (deleted.isErr()) return err(deleted.error);
```

### 書き込みの決まり

- `save`と`delete`は、呼ぶとその場でDBに書く。
- 1回の`save`または`delete`は、そのdomainの全部のtableを、全部成功か全部失敗で書く。

### 複数のdomainを保存するとき

1回の`save`または`delete`が全部成功か全部失敗になるのは、1つのdomainの中だけである。

- 複数のdomainの保存をまとめて巻き戻したいときは、トランザクションを持つDBで、`@zeltjs/db`の`@Transaction()`の中で保存する。
- D1のように、複数の保存にまたがるトランザクションを持たないDBでは、先に実行した保存は残る。

### 楽観ロック

`optimisticLock`を付けた列があるdomainでは、`save`と`delete`が上書きを防ぐ。

- 書くときは、起点のtableのlockの列が`pre`の値と一致することを条件にする。条件に合えば、lockの列を1進める。
- 条件に合わなければ、そのdomainには何も書かず、`ConflictError`を返す。

```ts
const saved = await this.orderCommands.save({ pre: order.value, input });
if (saved.isErr() && saved.error instanceof ConflictError) {
  // 読んだ後に、他の処理がこの注文を書き換えた。読み直すかどうかは呼んだ側が決める
}
```

- 読んでから保存するまでの間に、他の処理が同じdomainを書き換えていた場合に、`ConflictError`になる。
- lockの範囲は1つのdomainである。同じdomainへの保存は、変えた内容が無関係でも競合する。明細だけを変えた保存でも、起点のlockの列は進む。
- `ConflictError`のときにやり直すかどうかは、`save`を呼んだ側が決める。

## 保存する前のmodelをstageする

複数件を順に処理するとき、前の件で保存する予定のmodelを、後の件の読み取りから参照させる。appとDBの間にstagingの層を足し、範囲の中の読み取りは、staging、DBの順に見る。1件用に書いた処理を、書き換えずに複数件の処理で使える。

stagingは読み取りのための層である。stageしてもDBには書かれない。いつDBに書くかは、利用者が決める。

```ts
import { withStagingScope, stage } from "@zeltjs/drizzle-repository";

await withStagingScope(async () => {
  for (const row of rows) {
    // 前の行でstageしたUserも、DBにあるUserと同じように見える
    const checked = await this.users.isExistedByEmail(row.email);
    if (checked.isErr()) return err(checked.error);
    if (checked.value.id !== NOT_EXIST) continue;

    const staged = stage("User", { pre: null, input: { id: newUserId(), email: row.email } });
    if (staged.isErr()) return err(staged.error);
  }
});
```

| 関数 | 意味 |
|---|---|
| `withStagingScope(fn)` | stagingが有効な範囲を作る。`fn`が終わると、stageしたmodelは消える |
| `stage(名前, { pre, input })` | 保存する予定のmodelをstageする。名前はmodelの型の名前である。`save`に渡すのと同じ値を渡す |
| `stageDelete(名前, model)` | 削除する予定のmodelをstageする |

### stageを見る読み取り

| 見る | 見ない |
|---|---|
| `isExisted`、`getById`、`isExistedBy<一意キー>` | `findBy<外部キー>` |

- `findBy<外部キー>`は、stagingを見ない。stagingにあるのは一部の行だけなので、複数件を返す読み取りは、stagingだけでは結果がそろわないためである。
- 範囲の中では、確認した後のIDは「DBにある、またはstageされている」ことを表す。
- 削除をstageしたmodelは、ないものとして扱われる。`isExisted`は`NOT_EXIST`を返し、`getById`は`EntityNotFoundError`を返す。

### stageの決まり

- 主キーまたは一意キーが、すでにstageしたmodelと同じなら、`stage`は`StagingDuplicateError`を返す。`stageDelete`も、主キーがすでにstageしたmodelと同じなら、`StagingDuplicateError`を返す。NULLを含むキーは、重複として扱わない。
- 範囲の外で`stage`や`stageDelete`を呼ぶと、例外になる。
- 範囲の中で、もう1つ範囲を作ると、例外になる。

### 実行環境

範囲は、Node.jsの`AsyncLocalStorage`で引き継がれる。`fn`の中から呼んだ非同期の処理でも、同じ範囲のstageが見える。

`AsyncLocalStorage`が使える実行環境が必要である。Cloudflare Workersでは、compatibility dateが`2026-08-04`以降なら、そのまま使える。それより前なら、`nodejs_compat`フラグを付ける。

## 生成されないもの

次のものは生成されない。必要なら、アプリのRepositoryに自分で書く。

- キー以外の条件での検索
- 複数のIDをまとめて読むメソッド
- modelを返さない読み取り（一覧画面、集計）
- NULLのキー、`excludedFromModel`の列を含むキー、式や条件付きの一意indexからのメソッド
- 値の検証と、業務上の判断
