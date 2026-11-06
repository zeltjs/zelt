---
sidebar_label: GraphQL
---

# GraphQL

User model は特定の Query に属しません。`Query.user`、検索結果、`Post.author` のいずれも同じ User を参照します。どの経路で参照しても、User のデータ供給元と計算フィールドは共通です。

## 四つの責務 {#responsibilities}

| 定義 | 入力 → 出力 | 責務 |
| --- | --- | --- |
| `@Query` | 引数・実行コンテキスト → モデルの参照 | ルートで対象を選ぶ |
| `@Relation` | 親の必要データ → 関連先の参照 | 接続先を選ぶ。公開条件などの検索もここで行える |
| `@ResolveMultiField` | 参照の集合 → 元データ | ID からデータを供給する |
| `@ResolveField` | 必要な元データ → 値 | 計算フィールドを解決する |

Query と Relation は、対象の参照を選んで返す点で対等です。Query はルートの引数や実行コンテキスト、Relation は親のデータを使って対象を選びます。どちらも検索や絞り込みのために DB を使えますが、参照先のデータを揃える責務は供給元が担います。`$authorId` が親にあれば DB なしで参照を作れます。公開投稿の選別が必要なら、DB で条件を評価して ID を返します。

取得回数を親の件数に比例させないことを目標にします。モデルや取得段階をまたぐ追加 query は許容し、単一 SQL は保証しません。

## モデルを書く {#models}

モデルは普通の名前付き TypeScript 型です。初期版の識別子は必須かつ非 null の `id: string` とします。複合キーや数値 ID は初期範囲に含めません。

```ts no-check
export type User = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly $familyNameFirst: boolean;
};

export type Post = {
  readonly id: string;
  readonly title: string;
  readonly $authorId: User['id'];
};
```

モデルのデータは `User`／`Post` の一つの型にまとめます。プロパティ名が `$` で始まる場合は GraphQL 非公開、それ以外は公開フィールドです。供給元はこのモデル型を返し、計算フィールドと relation も同じ型を `Pick` します。public/private 用に型を分ける必要はありません。

`$familyNameFirst` は名前の計算に、`$authorId` は著者の参照を作るために使います。generator は `$` 始まりのプロパティを SDL から除外するので、クライアントは選択できず、GraphQL 応答にも含まれません。`$` を外した名前で公開することもありません。内部プロパティは通常の TypeScript のキーなので、`Pick` とドット記法で参照できます。

この規約は GraphQL への公開を制御するもので、JavaScript の private field ではありません。通常のオブジェクトアクセスや `JSON.stringify` では値が見えるため、モデルをそのまま返す別の HTTP API などには適用されません。非公開にするデータをモデルに持たせる場合は、`$passwordHash` のように `$` を付けます。

relation と計算フィールドは、この型に重複して書きません。generator がそれぞれの定義を加えて GraphQL 型を作ります。`Pick<User, 'id'>` は User への参照で、取得済みの User ではありません。

## User の供給・計算・relation {#user-resolver}

以下の例は、`DrizzleService.client` と Drizzle の `users`／`posts` テーブルが既存のアプリにある前提です。選択結果のキーはモデル型に対応し、`users.familyNameFirst` は非公開の計算用 boolean 列、`posts.published` は非公開の検索用 boolean 列です。認可による取得条件はアプリの供給元と検索サービスに追加します。

```ts no-check
import { inject } from '@zeltjs/core';
import {
  args, Query, Relation, ResolveField, ResolveMultiField, Resolver,
} from '@zeltjs/graphql';
import { and, asc, eq, inArray } from 'drizzle-orm';
import * as v from 'valibot';
import { DrizzleService } from './db/drizzle.service';
import { posts, users } from './db/schema';
import type { Post, User } from './models';

export const GetUserInput = v.object({ id: v.string() });
export const GetUsersInput = v.object({ ids: v.array(v.string()) });

@Resolver()
export class UserResolver {
  constructor(private db = inject(DrizzleService)) {}

  @Query()
  user(input = args(GetUserInput)): Pick<User, 'id'> {
    return { id: input.id };
  }

  @Query()
  users(input = args(GetUsersInput)): readonly Pick<User, 'id'>[] {
    return input.ids.map(id => ({ id }));
  }

  @ResolveMultiField()
  async dbValues(
    refs: readonly Pick<User, 'id'>[],
  ): Promise<ReadonlyMap<User['id'], User | null>> {
    const rows = await this.db.client
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        $familyNameFirst: users.familyNameFirst,
      })
      .from(users)
      .where(inArray(users.id, refs.map(ref => ref.id)));

    const byId = new Map(rows.map(row => [row.id, row]));
    return new Map(refs.map(ref => [ref.id, byId.get(ref.id) ?? null]));
  }

  @ResolveField()
  name(
    user: Pick<User, 'firstName' | 'lastName' | '$familyNameFirst'>,
  ): string {
    return user.$familyNameFirst
      ? user.lastName + ' ' + user.firstName
      : user.firstName + ' ' + user.lastName;
  }

  @Relation()
  async publicPosts(
    parents: readonly Pick<User, 'id'>[],
  ): Promise<ReadonlyMap<User['id'], readonly Pick<Post, 'id'>[]>> {
    const rows = await this.db.client
      .select({ id: posts.id, authorId: posts.authorId })
      .from(posts)
      .where(and(
        inArray(posts.authorId, parents.map(parent => parent.id)),
        eq(posts.published, true),
      ))
      .orderBy(asc(posts.id));

    return new Map(parents.map(parent => [
      parent.id,
      rows
        .filter(row => row.authorId === parent.id)
        .map(row => ({ id: row.id })),
    ]));
  }
}
```

`@Resolver()` のクラスに一つの `@ResolveMultiField()` を置くと、モデルの供給元を持つ resolver になります。供給元の第1引数の `Pick<User, 'id'>` から親モデルを確定し、戻り値も `$` プロパティを含む `User` に揃えます。追加のモード設定は不要です。一つのクラスの親モデルは固定され、同じ endpoint に同じモデルの供給元を複数登録することはできません。

`dbValues` というメソッド名は GraphQL に公開されません。`User` の `$` 始まりでないプロパティを公開し、`name` を計算フィールド、`publicPosts` を Post への relation として追加します。

`Pick` は親から受け取るデータの依存宣言です。`name` は非公開の `$familyNameFirst` を使えますが、`user.id` は読めません。`publicPosts` は親の ID から公開条件を満たす Post の参照だけを返します。検索時の `authorId` は親へ振り分けるために使用し、Post の元データとして保存しません。

## Post から User へ戻る {#post-resolver}

```ts no-check
import { inject } from '@zeltjs/core';
import { Relation, ResolveMultiField, Resolver } from '@zeltjs/graphql';
import { inArray } from 'drizzle-orm';
import { DrizzleService } from './db/drizzle.service';
import { posts } from './db/schema';
import type { Post, User } from './models';

@Resolver()
export class PostResolver {
  constructor(private db = inject(DrizzleService)) {}

  @ResolveMultiField()
  async dbValues(
    refs: readonly Pick<Post, 'id'>[],
  ): Promise<ReadonlyMap<Post['id'], Post | null>> {
    const rows = await this.db.client
      .select({
        id: posts.id,
        $authorId: posts.authorId,
        title: posts.title,
      })
      .from(posts)
      .where(inArray(posts.id, refs.map(ref => ref.id)));

    const byId = new Map(rows.map(row => [row.id, row]));
    return new Map(refs.map(ref => [ref.id, byId.get(ref.id) ?? null]));
  }

  @Relation()
  author(post: Pick<Post, '$authorId'>): Pick<User, 'id'> {
    return { id: post.$authorId };
  }
}
```

`author` は非公開の `Post.$authorId` から User の参照を作ります。この例の `$authorId` は非 null で、著者を必須の relation とするため、戻り値は `Pick<User, 'id'>` です。GraphQL では `author: User!` になります。User の取得や名前の計算は、このメソッドでは行いません。

著者なしを許すモデルでは、内部の `$authorId` を nullable にし、relation も `Pick<User, 'id'> | null` を返して、関連先がない場合を明示します。nullable は公開モデルの意味で決めます。DB の取得失敗に備えて一律に追加するものではありません。非 null の relation で参照先が存在しない／閲覧できない場合は GraphQL エラーです。

3種類のメソッドとも、バッチかどうかは親引数の形で決まります。`author` のように `Pick<T, ...>` を受け取るメソッドは親ごとに呼び、`publicPosts` のように `readonly Pick<T, ...>[]` を受け取るメソッドは複数の親をまとめて呼びます。デコレーターに batch オプションはありません。

同期・非同期と単体・バッチは独立です。どちらの形式も値または Promise を返せ、DB アクセスも可能です。ただし、単体形式で親ごとに DB を検索すれば N+1 が発生し得ます。複数の親の I/O をまとめたい場合は、バッチ形式で実装できます。async にするだけではバッチ化されません。

## 単体・バッチと同期・非同期 {#invocation-modes}

`ResolveMultiField`、`Relation`、`ResolveField` は同じ呼び出し規約を使います。親引数が `Pick<Model, ...>` なら親1件ごとに呼び、1件分の結果を直接返します。親引数が `readonly Pick<Model, ...>[]` なら複数の親をまとめて呼び、親 ID をキー、1件分の結果を値にした `ReadonlyMap` を返します。

どちらも同期の値か、メソッド全体の `Promise` を返せます。配列の親には `id` を `Pick` で明示してください。zelt が依存にない `id` を暗黙に追加することはありません。Map のキー順は自由ですが、返却キーの集合は入力の親 ID の集合と一致する必要があります。Map の値に個別の Promise を入れる形式は扱いません。

デコレーターの違いは結果の意味です。`ResolveMultiField` は元データまたは null、`Relation` は関連先の参照やその配列、`ResolveField` はフィールドの値を返します。Multi は供給するフィールドが複数という意味で、バッチ実行の指定ではありません。

どのメソッドでも DB や外部サービスにアクセスできます。単体形式で親ごとに I/O すれば N+1 が起こり得ますが、zelt はその選択を禁止しません。単体であることや `async` であることだけを理由に build warning も出しません。バッチ形式を選んだ場合に親をまとめて渡し、ID の対応を検査します。

以下は既存のメソッドを置き換える例です。同じクラスに供給元を二つ置いたり、同じ名前のフィールドを二つ登録したりはしません。

```ts no-check
// Alternative to the existing dbValues method in UserResolver.
@ResolveMultiField()
async dbValues(ref: Pick<User, 'id'>): Promise<User | null> {
  const [row] = await this.db.client
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      $familyNameFirst: users.familyNameFirst,
    })
    .from(users)
    .where(eq(users.id, ref.id))
    .limit(1);

  return row ?? null;
}
```

単体の供給元も、同じ operation 内ではモデルと ID ごとに取得結果を再利用します。ただし、未取得の異なる ID は個別に呼び出します。単体の DB 検索を自動で一つの query に合成することはありません。

```ts no-check
// Alternative to the existing name method in UserResolver.
@ResolveField()
async name(
  parents: readonly Pick<User, 'id' | 'firstName' | 'lastName' | '$familyNameFirst'>[],
): Promise<ReadonlyMap<User['id'], string>> {
  return new Map(parents.map(user => [
    user.id,
    user.$familyNameFirst
      ? user.lastName + ' ' + user.firstName
      : user.firstName + ' ' + user.lastName,
  ]));
}
```

この `name` も GraphQL では `String!` です。バッチ化は複数の親を処理する方法であり、公開するフィールドの型を配列や Map に変えるものではありません。Map の各値の型から、親1件分の GraphQL 型を生成します。

## 入口と公開される schema {#entry-points}

既存の endpoint 宣言で両方のクラスを登録します。

```ts no-check
graphql({
  path: '/graphql',
  resolvers: [UserResolver, PostResolver],
})
```

公開するルートフィールドは `@Query` メソッドとして書きます。名前はメソッド名、引数は `args(schema)`、対象モデル・単体／配列・nullability は戻り値型から決まります。generator はその宣言から schema と実行時の binding を生成します。Query メソッド自体やルートの名前を自動生成する設定はありません。上の例は次の schema になります。

```graphql
type Query {
  user(id: String!): User!
  users(ids: [String!]!): [User!]!
}

type User {
  id: ID!
  firstName: String!
  lastName: String!
  name: String!
  publicPosts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  author: User!
}
```

この `users` は全件検索ではなく、指定 ID の参照を入力順に返します。配列の順序と重複は維持し、空配列なら供給元を呼びません。例の `user` と `users` の要素は非 null なので、供給元が対象を取得できず null を返すと GraphQL エラーになります。該当なしを正常な null 応答にしたい場合は、Query の戻り値を `Pick<User, 'id'> | null`、配列なら `readonly (Pick<User, 'id'> | null)[]` と宣言します。

入力の `id`／`ids` は `v.string()` から生成するため、この例の引数型は `String!`／`[String!]!` です。モデルの識別子フィールドは `ID!` です。

`User` はルートでも `Post.author` でも同じ GraphQL 型です。親のパスから `PostAuthor` のような別名を作りません。endpoint 内のモデルは TypeScript の宣言を解決して識別し、別モデルが同じ GraphQL 型名になる場合は build エラーにします。

フィルター付きの検索も同じ `@Query` です。検索で対象を選び、元データではなく参照を返します。

```ts no-check
import { args, Query } from '@zeltjs/graphql';
import * as v from 'valibot';

export const SearchUsersInput = v.object({
  prefix: v.string(),
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
});

// Method inside UserResolver; userSearch is an injected application service.
@Query()
async searchUsers(
  input = args(SearchUsersInput),
): Promise<readonly Pick<User, 'id'>[]> {
  return this.userSearch.findVisibleUserRefs(input);
}
```

このメソッドは `UserResolver` 内に置く例です。`userSearch` はアプリ側のサービスで、検索・並び順・件数制限・検索対象の認可を担当します。戻り値から生成されるフィールドは `searchUsers(...): [User!]!` です。別の親モデルを返す Query は、そのモデルの resolver に定義します。

Query のフィールド名が重複すると build エラーになります。ID 指定でも検索でも、参照先の存在と閲覧可否は共通の供給元で確認します。Relation から到達した場合も同じです。

## ネストした要求の実行 {#execution}

```graphql
query {
  users(ids: ["u1", "u2"]) {
    name
    publicPosts {
      title
      author {
        name
      }
    }
  }
}
```

1. Query が User の参照を作り、User の供給元をバッチで呼びます。
2. `name` の依存を満たしてから計算します。`publicPosts` は親を集めて一度のバッチ検索に渡します。
3. relation が返した Post の ID をまとめ、Post の供給元で元データを取得します。
4. `Post.author` は `$authorId` を User の参照に変換します。
5. 著者の User が取得済みなら再利用し、未取得の ID だけをまとめて User の供給元へ渡します。
6. 各著者の `name` を計算し、クライアントが選んだフィールドだけを応答に含めます。

例の Query は ID を参照に変換するだけなので検索の DB アクセスはありません。最初の User 取得、公開投稿の ID 検索、Post のデータ取得で、DB に3回アクセスします。著者が最初の User 群と同じなら追加の User 取得はありません。未取得の著者があれば別のバッチ取得になります。この回数は、バッチ上限による分割やアプリ内の追加 I/O がない場合のものです。

フィルター付きの Query／Relation では、「条件に合う ID の検索」と「その ID の実データ取得」が別の DB アクセスになります。各取得段階で検索が必要なら、概ねルートとネストの取得段階数に比例して2回ずつになります。これは対象の選別とデータ供給を分けるために許容するコストです。ID 指定、親の外部キー、取得済みデータの再利用があれば省ける段階もあるため、常に「ネスト数 × 2」ではありません。

GraphQL の `publicPosts` は配列です。`user.publicPosts[1].author.name` のようなアクセスは応答を受け取った側で行い、GraphQL の選択は返される各要素に適用されます。

未選択の relation と計算フィールドは実行しません。`@skip`／`@include`、fragment、変数、alias を解釈した有効な選択を使います。親が null なら、その子の処理は行いません。

## バッチ・キャッシュ・失敗時の契約 {#runtime-contract}

- **供給元の入力**：単体形式には未取得 ID の参照を1件ずつ渡します。バッチ形式には、同じ endpoint・モデル・実行コンテキストでまだ取得していない ID を集め、重複を除いた空でない配列を渡します。どちらも、同じ operation 内の同一 ID の結果は再利用します。
- **バッチの単位**：同じ取得段階で解決可能になった要求を集めます。1リクエストで常に1回ではなく、深いネストで後から判明した ID は後続のバッチになります。モデル間の query 合成は保証しません。
- **供給元の出力**：単体形式は非公開プロパティを含む完全なモデルデータまたは null、バッチ形式はそれを各入力 ID に対応付けた Map を返します。データ自身の `id` は要求 ID と一致する必要があります。Map の順序は自由ですが、キーの欠落や余分なキーは契約違反です。
- **バッチ relation の出力**：入力の各親 ID に参照または参照配列を対応付けます。nullable な単体の関連先がなければ null、複数の関連先がなければ空配列を返します。必須の関連先がない場合はエラーです。配列の順序・重複は維持します。Map から親を省略することはできません。
- **バッチ計算フィールドの出力**：各親 ID に、その親のフィールド値を対応付けます。Map のキー集合を照合し、各値は GraphQL のフィールド型に従って処理します。null を返せるかは結果の型宣言で決まります。
- **再利用の範囲**：元データと、対象が存在しないという取得結果は、1回の GraphQL operation 内だけで共有します。モデル＋ID をキーとし、同じ ID を持つ別モデルは混ぜません。別リクエスト・別 endpoint・別認可コンテキストには共有しません。 バッチ relation とバッチ計算フィールドの結果も、同じ operation 内のフィールドと親 ID ごとに共有します。単体の relation と計算フィールドは、GraphQL から呼ばれるごとに実行します。
- **存在と認可**：`{ id }` だけを選んでも、参照だけで応答を作らず供給元で存在・閲覧可否を確認します。同じ operation 内では、どの Query や relation から参照してもモデルの閲覧可否は変わらないものとし、relation の公開条件は関連先の選別として別に適用します。
- **エラー**：取得失敗を null や空配列に置き換えません。例外は該当フィールドの GraphQL エラーとなり、schema の nullability に従って伝播します。参照先が null の場合も、非 null の relation／検索結果では通常の GraphQL エラーになります。
- **I/O の責務**：framework は3種類とも配列引数を選んだメソッドに親をまとめて渡します。単体引数のメソッドは、同期でも非同期でも親ごとの呼び出しです。ただし利用者がバッチ関数内で1件ずつ SQL を実行すれば N+1 は残ります。`IN` 検索など、実際のバッチ取得は実装側の契約です。

初期版の relation と計算フィールドは GraphQL 引数を持ちません。検索引数はルート Query で扱います。親ごとのページングや引数付き relation は後続の拡張です。異なる条件を無条件に一つのバッチへ混ぜる仕様にはしません。

User → Post → User のようなモデルの relation の循環は許容します。実行は有限のクライアント選択に従います。これは計算フィールド同士の依存を許可するものではありません。モデルを変更する Mutation と、operation 内の取得結果の無効化は初期契約の範囲外です。その契約を定義するまでは、モデルモードでの Mutation の公開を許可しません。

## 型と依存の検査 {#type-contract}

TypeScript は `Pick` のキーとメソッド内部のアクセスを検査します。generator は通常の TypeScript 型検査だけでは分からないメソッド間の契約を検査します。

- 親モデルは供給元で固定します。供給元は `$` プロパティを含むモデル型を返し、計算フィールドと relation の依存も同じモデル型の `Pick` から読み取ります。
- 依存はモデルの元データのプロパティに限定し、`$` 始まりの非公開プロパティも使えます。別の計算フィールドや relation の結果への依存は build エラーです。
- Query と単体 relation の結果は、登録済みのモデルの `Pick<T, 'id'>`、その配列、または nullable 形です。バッチ relation では Map の各値を同じ形にします。どちらも Promise を外して結果の型を解釈します。モデル全体や追加フィールドを含む戻り値宣言は受け付けません。構造的型付けだけでは余分なプロパティを完全には排除できないため、runtime も参照から ID だけを取り込みます。
- 3種類とも単体の親は直接の `Pick<T, ...>`、バッチの親はその readonly 配列です。バッチの Pick は親 ID との対応付けのために `id` を含める必要があります。初期版では独自ジェネリックや別名を経由した `Pick` の解釈は対象外とし、診断を出します。
- `$` 始まりの元データのプロパティは schema に含めません。公開する元データ・relation・計算フィールドの名前は重複できません。識別子は公開される `id` のままとし、`$id` に置き換えることはできません。
- `$` 規約の対象はモデルの元データです。Query・Relation・ResolveField の公開名は GraphQL の名前の規則に従う必要があり、`$` 始まりなど不正な公開名は build エラーにします。
- 公開する元データのフィールドは初期版では組み込み scalar とその nullable／配列の形に限定します。計算や参照作成に必要な内部プロパティは、同じ型に `$` 始まりの名前で追加できます。モデル間の接続は必ず relation で宣言します。
- 計算フィールドの親1件分の出力は同じ scalar 範囲です。単体・バッチのどちらも同期・非同期を選べ、DB や外部サービスの I/O も許容します。別の計算フィールドの結果への依存は引き続き対象外です。

Map の全キーの存在、DB 応答の完全性、I/O の有無などは TypeScript だけでは保証できません。生成されたコードでのチェックと、実装側が守る契約で補います。部分取得したデータを `as User` で完全なモデルデータとして扱っても、型安全の契約を満たしたことにはなりません。

## 取得列と selector の範囲 {#selection}

この初期契約では供給元は `$` プロパティを含む固定のモデル型を返します。`name` だけを要求しても User の供給元は `id`、`firstName`、`lastName`、非公開の `$familyNameFirst` を返します。selector は必要な relation と計算、その依存を決めますが、DB 列の動的な部分取得までは行いません。内部データを取得しても、公開範囲が広がることはありません。

固定したメソッド戻り値型と整合するデータを返すことを優先します。依存データを補った選択を Drizzle の `columns`／`with` に変換する機能は、部分取得の戻り値の契約とともに、今後設計します。モデルを横断する単一 SQL への統合も初期の保証には含めません。

## Schema-first と内部プロパティ {#private-schema-first}

SDL は公開フィールドだけを記述します。`$` は GraphQL のフィールド名には使えないため、内部プロパティを SDL に書いたり、SDL だけから生成したりはしません。schema-first でも内部データの型は TypeScript 側で宣言する必要があります。公開 schema と resolver が受け取る親データの型は同一とは限りません。

この `$` 規約は schema-first の名前と衝突しませんが、モデルの供給元と参照解決の schema-first 対応は、下記のとおり初期範囲外です。

## Resolver のモード {#compatibility}

モデルの供給元と参照による解決は code-first 専用です。`@Resolver()` に `@ResolveMultiField()` がある場合、そのクラスにはモデルの契約を適用します。供給元を持たないクラスは、従来の直接値を返す resolver として扱います。モードを切り替えるデコレーターのオプションはありません。両方を同じ endpoint に置く場合、公開型名・ルートフィールド名の衝突は build エラーです。schema-first への対応は初期範囲外です。

generator は型・依存・参照先・binding を解析し、SDL と prebuilt runtime を生成します。アプリの resolver は自身から生成されたファイルを import しません。既存と同じく entry が prebuilt を adapter に渡します。モデルの型と依存は生成時に再解析します。起動時は実行時に残る宣言と、生成された manifest・SDL の整合を検査します。

認可情報やアプリサービスは既存の DI・コンテキスト捕捉の規約で受け取ります。バッチ実行時にも元の実行コンテキストを復元し、同期コンテキストモードでは `await` 前に必要な値を捕捉します。

## 契約の要点 {#decisions}

1. モデルの識別子は初期版では `id: string`。親モデルは唯一の供給元から確定します。
2. Query と Relation は参照を選んで返します。公開する Query は通常のメソッドで定義し、schema を生成します。
3. 3種類のメソッドで単体・バッチの規約を揃え、親引数の配列型で決めます。同期・非同期や I/O の有無とは独立です。
4. 単体形式は結果を直接返し、バッチ形式は親 ID から結果への Map を返します。該当なしと契約違反を区別します。
5. 内部データを operation 内で共有します。各段階の ID 検索と実データ取得が別 query になることを許容します。
6. 一つのモデル型にデータをまとめ、`$` 始まりだけを GraphQL 非公開にします。供給元は固定形状のモデルデータを返します。列単位の動的 selector と計算フィールド同士の依存は後続です。

## HTTP の扱い {#http}

HTTP の処理は `graphql-http`、GraphQL の検証と実行は `graphql-js`、operation 内のバッチ取得は DataLoader に委ねます。zelt はモデルの契約と実行コンテキストを接続します。

GET は Query、POST は Query と Mutation を受け付けます。POST の本文は `Content-Type: application/json` で送り、応答には `Accept: application/graphql-response+json` を指定できます。この応答形式では GraphQL の構文エラー・文書の検証エラー・実行前の変数エラーを HTTP 400、実行結果を HTTP 200 として扱います。実行時のフィールドエラーは、HTTP 200 の応答にも含まれます。`application/json` の応答ではプロトコル上、GraphQL の検証エラーが HTTP 200 になる場合があります。

不正な JSON は 400、GET の Mutation は 405、対応しない Accept は 406、対応しない本文の Content-Type は 415 です。モデルのバッチ取得と HTTP リクエストのバッチ送信は別であり、HTTP の配列リクエストは受け付けません。

## Endpoint と API {#api-boundary}

アプリケーションでは次の API を使います。

- `graphql()`
- `Resolver`
- `Query`
- `Mutation`
- `ResolveField`
- `ResolveMultiField`
- `Relation`
- `args()`
- `gqlScalar()`
- `GqlOutput`

`graphql({ path, resolvers, schema? })` は endpoint を宣言します。code-first か schema-first かは、endpoint ごとの `schema` の有無で決まります。code-first では省略し、schema-first では `zelt graphql codegen` が生成した helper の `schema` export を渡します。

どちらの場合も `graphql()` は生成された runtime を直接参照しません。runtime は adapter の `prebuilt` オプションから別途渡します。詳しくは下記の Build flow を参照してください。

各 endpoint は `graphql({ path, resolvers, name })` の `name` を識別用の key として使います。`name` は省略可能で、デフォルトは `'graphql'` です。これは `http()` の `name` と同じ規約です。key は endpoint ごとの prebuilt entry と生成ファイル名を区別するために使います。

複数の `graphql()` を mount するには、それぞれ異なる `name` が必要です。同じ key を共有すると build エラーになります。`name` は `/^[A-Za-z0-9_-]+$/` にマッチし、予約済みの Windows デバイス名（`CON`、`PRN`、`AUX`、`NUL`、`COM1`-`9`、`LPT1`-`9`）ではない値でなければなりません。不正な `name` を渡すと `graphql()` は即座に throw します。

endpoint は自由に組み合わせられます。同じ app 内に複数の code-first、複数の schema-first、または両方を混在させられます。各 endpoint は、自身の schema（または resolver から導出した SDL）と resolver だけを結び付けます。

次の API は、schema-first の生成された helper 専用に export されます。

- `readGraphqlArgs()`
- `validateGraphqlArgs()`

`graphqlPlugin()`、`generateGraphqlSdl()`、`generateSdlForResolvers()`、schema-first codegen、metadataの検査、型変換といったbuild時APIは、`@zeltjs/graphql/codegen` からのみexportされます。

adapter と framework 内部で使う runtime 統合 API は、`@zeltjs/graphql` にあります。`createGraphqlExecutor()`、`executeGraphqlRequest()`、`GraphqlRuntimeManifest`、`GeneratedGraphqlRuntime`、`GraphqlPrebuiltEntry`、`computeGraphqlPrebuiltHash()` がこれに含まれます。通常、アプリケーションコードで使う必要はありません。

## モデルを介さない resolver {#code-first}

モデルの参照・供給元を使わず、戻り値をそのまま公開する場合は、`@ResolveMultiField()` を持たない `@Resolver()` を使います。この形式の `@Query` はオブジェクトを返します。供給元を持つクラスの `@Query` が参照を返す契約とは区別します。

```ts no-check
import { createApp, http } from '@zeltjs/core';
import { args, graphql, Query, Resolver } from '@zeltjs/graphql';
import * as v from 'valibot';

const GetProductInput = v.object({
  id: v.string(),
});

type Product = {
  readonly id: string;
  readonly name: string;
};

@Resolver()
class ProductResolver {
  @Query()
  product(input = args(GetProductInput)): Product {
    return { id: input.id, name: 'Keyboard' };
  }
}

export const app = createApp([
  http({
    children: [
      graphql({
        path: '/graphql',
        resolvers: [ProductResolver],
      }),
    ],
  }),
]);
```

`args(schema)` は Standard Schema から GraphQL の field 引数を定義し、runtime 時に validation を行います。

## Schema-first {#schema-first}

```graphql
type Query {
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
}
```

```bash
zelt graphql codegen --schema src/graphql/schema.graphql --out src/generated/graphql.ts
```

このコマンドは `src/generated/graphql.ts` を生成します。ファイルには型付き helper の `Gql` namespace と、schema を識別する `schema` export（`{ sdl }`）が含まれます。

また、`<cwd>/.zelt/graphql-codegen.json` のエントリを作成または更新し、schema の content hash と helper のパスを対応付けます。`graphqlPlugin()` はこの対応を使って、endpoint の resolverChecks の出力先を決めます。詳しくは下記の Build flow を参照してください。

```ts no-check
import { Query, Resolver } from '@zeltjs/graphql';
import { Gql } from '../../generated/graphql';

@Resolver()
class ProductResolver {
  @Query()
  product(input = Gql.Query.product.args()): Gql.Query.product.Result {
    return { id: input.id, name: 'Keyboard' };
  }
}
```

この helper の `schema` export を `graphql()` に渡して、endpoint に schema を結び付けます。

```ts no-check
import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';
import { schema } from './generated/graphql';
import { ProductResolver } from './graphql/product.resolver';

export const app = createApp([
  http({
    children: [
      graphql({
        path: '/graphql',
        resolvers: [ProductResolver],
        schema,
      }),
    ],
  }),
]);
```

schema-first の各 endpoint と schema の対応は、plugin 設定ではなく、アプリケーションコードの `graphql()` 呼び出しで定義します。そのため、複数の schema-first endpoint をそれぞれ異なる `name` で mount できます。schema-first と code-first の混在も可能です。

```ts no-check
graphql({ name: 'storefront', path: '/graphql', resolvers: [...], schema: storefrontSchema }),
graphql({ name: 'admin', path: '/admin/graphql', resolvers: [...], schema: adminSchema }),
```

`storefrontSchema` と `adminSchema` は、異なる `--out` を指定した2回の `zelt graphql codegen` で生成します。二つの endpoint は resolver や schema を共有しません。`/graphql` に送られた query は storefront schema の field のみ、`/admin/graphql` に送られた query は admin schema の field のみを参照できます。

生成された helper には、runtime validation を追加できます。

```ts no-check
@Query()
product(input = Gql.Query.product.args(GetProductInput)): Gql.Query.product.Result {
  return { id: input.id, name: 'Keyboard' };
}
```

schema-firstモードでは、SDLがsource of truthであり続けます。生成されたargs helperに渡されたStandard Schemaは、追加のvalidationとして扱われます。

`args<T>()` は意図的にuser-facing APIには含まれていません。Schema-firstの型は、手書きのgeneric引数ではなく、生成されたhelperから得るべきです。

## Build flow {#build-flow}

build で生成した runtime 出力（`.zelt/` 配下のすべて）を import するのは、platform entry ファイルだけです。app 定義はこれらを import しないため、初回の build でも、生成物がなければ app を読み込めないという循環は生じません。

Schema-first app は `zelt graphql codegen` が `src/generated/graphql.ts` に出力する型付き helper を import します。ただし codegen は `schema.graphql` から直接実行でき、app の評価を必要としないため、こちらも循環は生じません。

```ts no-check
import { graphqlPlugin } from '@zeltjs/graphql/codegen';
```

`zelt.config.ts` に plugin を登録します。

```ts no-check
import { defineConfig } from '@zeltjs/cli';
import { graphqlPlugin } from '@zeltjs/graphql/codegen';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [graphqlPlugin()],
  build: { entry: './src/node.ts' },
  dev: { entry: './src/node.ts' },
});
```

その後、`zelt build` と `zelt dev` は次の2つの生成ステップを自動的に実行します。

1. 各 `graphqlPlugin()` は `graphql({ path, resolvers })` の endpoint ごとに、`.zelt/graphql/<key>.runtime.ts`（`export const graphqlPrebuilt = { runtime, resolversHash }`）と、対になる `.graphql` SDL ファイルを書き出します。`<key>` は検証済みの endpoint の key で、`name` を省略した場合は `graphql` です。二つの endpoint が同じ key を使うと出力が衝突するため、それぞれ異なる `name` を指定してください。
2. CLI はすべての plugin の成果物を集約し、`.zelt/prebuilt.ts`（`export const zeltPrebuilt = {...} satisfies ZeltPrebuilt`）を書き出します。このファイルは `graphql` feature の下で各モジュールを key ごとに re-export します。plugin からの成果物がない場合も生成されます。

platform entry ファイルは `zeltPrebuilt` を静的に import し、adapter に渡します。

```ts no-check
import { onNode } from '@zeltjs/adapter-node';
import { app } from './app';
import { zeltPrebuilt } from '../.zelt/prebuilt';

const nodeApp = await onNode(app, { prebuilt: zeltPrebuilt });
```

すべての adapter（`onNode`、`onBun`、`onCloudflareWorkers`、`onElectron`、`onLambda`）は同じ `prebuilt` オプションを受け付けます。entry ファイルは静的な `import` のみを使うため、Cloudflare Workers の `wrangler` bundle のように静的 import を要求する bundler でも、変更せずに動作します。どの platform にもファイルシステムへの fallback はありません。

一つの `graphqlPlugin()` が、app 内のすべての endpoint を処理します。code-first と schema-first の選択は endpoint ごとの宣言で決まります。plugin にそれらを選択する `mode` オプションはありません。両方が混在する app も同じ plugin で扱えます。

### Code-first {#code-first-1}

1. モデルの供給元・relation・計算フィールド、またはモデルを介さない resolver を書く。
2. `graphql({ path, resolvers })` を設定する。
3. `zelt.config.ts` の `plugins` に `graphqlPlugin()` を追加する。
4. `zelt build` または `zelt dev` を実行する。
5. platform entryファイルが `../.zelt/prebuilt` から `zeltPrebuilt` をimportし、adapterに渡す。

### Schema-first {#schema-first-1}

1. `schema.graphql` を書く。
2. `zelt graphql codegen --schema ... --out ...` を実行する。
3. 生成された `Gql` helperを使ってresolverを書く。
4. helperの `schema` exportを渡して `graphql({ path, resolvers, schema })` を設定する。
5. `zelt.config.ts` の `plugins` に `graphqlPlugin()` を追加する(code-firstと同じ — schema-first固有のオプションはない)。
6. `zelt build` または `zelt dev` を実行する。
7. platform entryファイルが `../.zelt/prebuilt` から `zeltPrebuilt` をimportし、adapterに渡す。

schema-first の endpoint を追加するには、異なる `--out` と endpoint ごとに異なる `name` を使って、ステップ1〜4を繰り返します。

`zelt dev` 中に schema-first codegen を自動実行する機能は、この時点のリリース範囲に含まれません。`schema.graphql` を変更したら、`zelt build` / `zelt dev` の前に `zelt graphql codegen` を実行してください。codegen manifest（`<cwd>/.zelt/graphql-codegen.json`）のエントリが欠落しているか古い場合、build は codegen の再実行を促すエラーで失敗します。

schema-first の各 endpoint には、resolver メソッドの戻り値の型が、対応する `Gql.Query` / `Gql.Mutation` の結果型に代入可能かを検査するファイルが自動生成されます。

出力先は endpoint の schema hash に対応する codegen helper の隣です。ファイル名は `<helper>.resolver-checks.ts` で、二つの endpoint が一つの helper を共有する場合は `<helper>.<name>.resolver-checks.ts` になります。出力先の設定は不要です。`graphqlPlugin()` が codegen manifest から対応を調べます。

## 対応範囲と起動時の検査 {#current-limitations}

GraphQL には prebuilt モジュールが必要です。モジュールや endpoint の prebuilt entry がない場合、または entry ファイルが `zeltPrebuilt` を import していない場合は、endpoint の起動時に throw します。どの platform でも、代替処理でそのまま起動することはありません。

各 endpoint は key に対応する prebuilt entry を使います。検査の役割はビルド時と起動時で分けます。

- `zelt build` / `zelt dev` では、GraphQL の生成処理が TypeScript の解析キャッシュを更新し、モデルの型・供給元・依存・参照先を再解析して manifest と SDL を生成します。
- 起動時は、prebuilt entry の欠落や、endpoint の path、resolver 名、GraphQL メソッド名、デコレーターの種類、公開フィールド名の不一致をエラーにします。生成されたモデル情報と SDL についても、元データの型や参照先の単体・配列・nullability が一致するかを検査します。

TypeScript の型だけの変更は JavaScript から消えるため、古い manifest と SDL が互いに整合している場合、起動時には検知できません。型や依存を変更したら生成とビルドをやり直し、アプリと対応する prebuilt を一緒に配置してください。型の fingerprint を埋め込むための追加のコード変換は行いません。

### モデルを介さない code-first {#code-first-2}

- 出力型のサポートは意図的に狭く保たれています。
- 複雑なGraphQLインターフェースはサポートが限定的です。
- Code-firstは、custom scalar codecとnamed unionを実験的にサポートしています。
- フィールド名はデフォルトでメソッド名になります。可能な場合、decoratorを通じて明示的な名前もサポートされます。
- フィールドの引数はStandard Schemaによるruntime validationを使い、SDL生成にはschema adapterが必要です。

### Schema-first {#schema-first-2}

- Schema-first codegenは、現時点では組み込みscalar、object型、`Query`、`Mutation` をサポートしています。
- custom scalar、enum、union、interface、input objectは、意図的に制限されているか、今後に見送られています。
- custom scalar codecとnamed unionに対するschema-firstのサポートはまだ限定的で、今後別途拡張される予定です。
- ルートの `Query` と `Mutation` のfieldにはresolver bindingが必須です。
- Object型のfieldは、GraphQLのデフォルトのfield resolutionに頼ることができます。
- 生成された `Gql.Query.<field>.args()` helperが、schema-firstのメインのargs APIです。
- user-facingな `args<T>()` は意図的にサポートされていません。
