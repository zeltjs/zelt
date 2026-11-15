---
sidebar_label: GraphQL × Drizzle
---

# Drizzle のテーブルを GraphQL で公開する

`@zeltjs/graphql-drizzle` は、Drizzle で定義したテーブルとリレーションから、GraphQL のモデル型と resolver の土台を生成します。

カラムの値の取得とリレーションの取得は生成されたコードが担い、あなたは「どのデータを返すか（Query）」と「アプリ固有の計算フィールド」だけを書きます。DB のスキーマを変更したら、ビルドし直すだけで GraphQL 側も追従します。

このページは [GraphQL](./graphql.md) の Code-first の考え方（`@Query` が ID を選び、フィールドは ID から解決する）を前提にしています。

## できること・しないこと {#scope}

| 生成するもの | 生成しないもの（あなたが書くもの） |
| --- | --- |
| テーブルごとのモデル型（`interface User`） | root の `@Query`（どの行を、どんな条件で返すか） |
| ID からカラムの値をまとめて取得する処理 | 計算フィールド（`@ResolveField`） |
| Drizzle の `relations()` に対応するリレーション | 認可・絞り込み・ページング |
| | 入力された ID の検証（`args()` の validator） |

Mutation は生成しません。`where` や並び順はアプリごとに要件が異なるため、Query として自動生成せず、あなたが通常の `@Query` として書きます。

## 前提 {#requirements}

- `drizzle-orm` 0.45 系。リレーションは `relations()` で定義します。
- PostgreSQL または SQLite。
- DB クライアントは `@zeltjs/db` の `DatabaseService` を継承した service から取得します（[データベース](./db.md)）。生成されたコードもこの service の `client` を使うため、トランザクションの伝播はそのまま効きます。

```bash
pnpm add @zeltjs/graphql-drizzle
```

## 設定 {#configuration}

`zelt.config.ts` に `drizzleGraphqlPlugin()` を登録します。**`graphqlPlugin()` より前に置いてください。** 生成されたコードを `graphqlPlugin()` が解析するためです。

```ts
// @filename: graphql-drizzle/zelt.config.ts
// ---cut---
import { defineConfig } from '@zeltjs/cli';
import { graphqlPlugin } from '@zeltjs/graphql/codegen';
import { drizzleGraphqlPlugin } from '@zeltjs/graphql-drizzle/codegen';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [
    drizzleGraphqlPlugin({
      schema: './src/db/schema.ts',
      database: { module: './src/db/drizzle.service.ts', export: 'DrizzleService' },
      out: './src/generated/drizzle-graphql.ts',
    }),
    graphqlPlugin({ schemaAdapter: valibotAdapter }),
  ],
  build: { entry: './src/node.ts' },
  dev: { entry: './src/node.ts' },
});
```

| オプション | 内容 |
| --- | --- |
| `schema` | テーブルと `relations()` を export しているモジュール |
| `database` | `DatabaseService` を継承した service のモジュールと export 名 |
| `out` | 生成ファイルの出力先 |

`zelt build` と `zelt dev` は、ビルドのたびに `out` を生成し直します。生成は `schema` のモジュールだけを読み込み、app は読み込みません。そのため初回のビルドでも、app が生成ファイルを import していて問題ありません。

生成ファイルは編集しないでください。次のビルドで上書きされます。カスタマイズはすべて、後述の resolver と schema 側の指定で行います。

## スキーマを書く {#schema}

テーブルとリレーションは、普段どおり Drizzle で書きます。

```ts
// @filename: graphql-drizzle/src/db/schema.ts
// ---cut---
// src/db/schema.ts
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { gqlMeta } from '@zeltjs/graphql-drizzle';
import * as v from 'valibot';

export const UserId = v.pipe(v.string(), v.uuid(), v.brand('UserId'));
export type UserId = v.InferOutput<typeof UserId>;
export type PostId = string & v.Brand<'PostId'>;

export const users = gqlMeta(
  pgTable('users', {
    id: uuid().primaryKey().defaultRandom().$type<UserId>(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    passwordHash: gqlMeta(text('password_hash').notNull(), { hidden: true }),
  }),
  { name: 'User' },
);

export const posts = gqlMeta(
  pgTable('posts', {
    id: uuid().primaryKey().defaultRandom().$type<PostId>(),
    title: text().notNull(),
    authorId: uuid('author_id').$type<UserId>().notNull().references(() => users.id),
    createdAt: gqlMeta(timestamp('created_at').notNull().defaultNow(), { hidden: true }),
  }),
  { name: 'Post' },
);

export const sessions = gqlMeta(
  pgTable('sessions', {
    id: uuid().primaryKey(),
    userId: uuid('user_id').$type<UserId>().notNull().references(() => users.id),
  }),
  { hidden: true },
);

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  sessions: many(sessions),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
```

### `gqlMeta` で公開範囲を指定する {#gql-meta}

`gqlMeta(対象, 指定)` は、テーブルまたはカラムをそのまま返します。Drizzle から見た型も動作も変わりません。GraphQL 向けの指定だけを、定義と同じ場所に書けます。

| 対象 | 指定 | 意味 |
| --- | --- | --- |
| テーブル | `{ name: 'User' }` | GraphQL の型名。省略すると export 名を PascalCase にしたもの（`users` → `Users`） |
| テーブル | `{ hidden: true }` | モデルを生成しない。このテーブルへのリレーションも生成しない |
| カラム | `{ hidden: true }` | GraphQL に公開しない。resolver からは `$` 付きの名前で参照できる（後述） |

この例では ID と外部キーを brand 型にしていますが、brand 型は必須ではありません。使う場合は Drizzle の `$type<>()` で指定すると、その型が生成されるモデル型にそのまま引き継がれます（[主キーと ID](#primary-key)）。

`gqlMeta` を付けないテーブルは公開されます。DB に新しいテーブルやカラムを追加すると、次のビルドで GraphQL にも現れます。公開したくないものには `hidden` を付けてください。

## 生成されるもの {#generated}

上のスキーマから、次のコードが生成されます（抜粋）。

```ts
// @filename: graphql-drizzle/src/generated/drizzle-graphql.ts
import type { ID } from '@zeltjs/graphql';
import { users, posts } from '../db/schema';
// ---cut---
// src/generated/drizzle-graphql.ts（生成ファイル・編集しない）
type UsersRow = typeof users.$inferSelect;
type PostsRow = typeof posts.$inferSelect;

export interface User {
  readonly id: ID<UsersRow['id']>;
  readonly firstName: UsersRow['firstName'];
  readonly lastName: UsersRow['lastName'];
  readonly $passwordHash: UsersRow['passwordHash'];
  readonly posts: readonly Post[];
}

export interface Post {
  readonly id: ID<PostsRow['id']>;
  readonly title: PostsRow['title'];
  readonly authorId: PostsRow['authorId'];
  readonly $createdAt: PostsRow['createdAt'];
  readonly author: User;
}

export abstract class GeneratedUserResolver { /* カラムとリレーションの解決 */ }
export abstract class GeneratedPostResolver { /* カラムとリレーションの解決 */ }
```

- **モデル型**: カラムはそのキー名のプロパティになり、型は Drizzle が推論する型（`$inferSelect`）をそのまま参照します。`hidden` のカラムは `$` 付きの名前になり、[GraphQL の規約](./graphql.md#code-first)どおりスキーマには現れません。
- **リレーション**: `relations()` のキー名のプロパティになります。`hidden` のテーブルへのリレーション（上の例の `sessions`）は生成されません。
- **`GeneratedXxxResolver`**: カラムの値を ID からまとめて取得する `@ResolveMultiField` と、各リレーションの `@Relation` を持つ抽象クラスです。

### 主キーと ID {#primary-key}

単一カラムの主キーが、モデルの `id` になります。主キーのカラム名は問いませんが、型は文字列に限ります（理由は下記）。

| | 型 |
| --- | --- |
| TypeScript（`User['id']`） | 主キーの型そのもの。上の例では `UserId`、`Post['id']` は `PostId`。`$type<>()` を付けなければ `string` |
| GraphQL | `ID!` |

`ID<T>` は「GraphQL では `ID` として公開する」という印を `T` に付けた型で、値は `T` のまま扱えます。`UserId` の値はそのまま `User['id']` に代入でき、`User['id']` も `UserId` として使えます。

GraphQL の ID は、すべてのモデルを通して一意であることが前提です。主キーには、テーブルをまたいでも重複しない文字列（UUID など）を使ってください。テーブルごとの連番になる整数の主キーは、この前提を満たせないため公開できません（生成時エラー）。

GraphQL の型は `ID` のままで、`UserId` のような独自の scalar にはしません。クライアントのキャッシュやコード生成は `ID` を前提にしているためです。

このスキーマから得られる GraphQL スキーマは次のとおりです。

```graphql
type User {
  id: ID!
  firstName: String!
  lastName: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  authorId: String!
  author: User!
}
```

`Query` 型には、あなたが書いた `@Query` だけが入ります。

## resolver を書く {#resolver}

公開する各モデルについて、生成された抽象クラスを継承した resolver を **1 つ** 用意し、`graphql()` に登録します。Query と計算フィールドは、このファイルに通常どおり書きます。モデルが何を公開するかは、このファイル（追加したフィールドの宣言と resolver）と継承元をたどれば分かります。

```ts
// @filename: graphql-drizzle/src/graphql/user.resolver.ts
// ---cut---
// src/graphql/user.resolver.ts
import { inject } from '@zeltjs/core';
import { args, Query, ResolveField, Resolver } from '@zeltjs/graphql';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { DrizzleService } from '../db/drizzle.service';
import { UserId, users } from '../db/schema';
import { GeneratedUserResolver, type User } from '../generated/drizzle-graphql';

const GetUserInput = v.object({ id: UserId });

declare module '../generated/drizzle-graphql' {
  interface User {
    readonly displayName: string;
  }
}

@Resolver()
export class UserResolver extends GeneratedUserResolver {
  constructor(private db = inject(DrizzleService)) {
    super();
  }

  @Query()
  async user(input = args(GetUserInput)): Promise<Pick<User, 'id'> | null> {
    const [row] = await this.db.client
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.id));
    return row ?? null;
  }

  @ResolveField()
  displayName(user: Pick<User, 'firstName' | 'lastName'>): string {
    return `${user.firstName} ${user.lastName}`;
  }
}
```

```ts
// @filename: graphql-drizzle/src/graphql/post.resolver.ts
// ---cut---
// src/graphql/post.resolver.ts
import { Resolver } from '@zeltjs/graphql';
import { GeneratedPostResolver } from '../generated/drizzle-graphql';

@Resolver()
export class PostResolver extends GeneratedPostResolver {}
```

```ts
// @filename: graphql-drizzle/src/app.ts
import { graphql } from '@zeltjs/graphql';
import { UserResolver } from './graphql/user.resolver';
import { PostResolver } from './graphql/post.resolver';
// ---cut---
// src/app.ts
graphql({
  path: '/graphql',
  resolvers: [UserResolver, PostResolver],
});
```

### Query は存在する行の ID だけを返す {#query-existence}

[GraphQL の契約](./graphql.md#runtime-contract)のとおり、Query が返した ID は「その行が存在する」ことを意味します。クライアントから受け取った ID をそのまま返さず、上の例のように DB で存在を確かめてから返してください。存在しない ID を返すと、カラムを取得する時点で GraphQL エラーになります。

クライアントから届く ID は、どの主キーでも文字列です。主キーの型への変換と検証は、`args()` の validator で行います。上の例では、`UserId` のスキーマが UUID であることを検証して brand を付けます。

### フィールドを追加する {#add-field}

生成されたモデルにフィールドを追加するには、[GraphQL のモデル](./graphql.md#code-first)と同じく、モデル型に宣言して `@ResolveField` で解決します。生成ファイルは編集できないため、宣言は resolver のファイルから `declare module` で生成された `interface` に追加します（TypeScript の declaration merging）。上の例では `User.displayName: String!` が追加されます。

追加したフィールドはモデル型の一部になるため、別の `@ResolveField` の依存にも、関連先からの参照（`Post.author` の先）にも使えます。`@ResolveField` の引数の `Pick<User, ...>` で、計算に必要なフィールドを宣言します。`hidden` のカラムも `$` 付きの名前で参照できます。

```ts
// @filename: graphql-drizzle/src/graphql/user.resolver.ts
import { Resolver, ResolveField } from '@zeltjs/graphql';
import { GeneratedUserResolver, type User } from '../generated/drizzle-graphql';
// ---cut---
declare module '../generated/drizzle-graphql' {
  interface User {
    readonly displayName: string;
    readonly initials: string;
    readonly hasPassword: boolean;
  }
}

@Resolver()
export class UserResolver extends GeneratedUserResolver {
  @ResolveField()
  displayName(user: Pick<User, 'firstName' | 'lastName'>): string {
    return `${user.firstName} ${user.lastName}`;
  }

  @ResolveField()
  initials(user: Pick<User, 'displayName'>): string {
    return user.displayName
      .split(' ')
      .map((part) => part.charAt(0))
      .join('');
  }

  @ResolveField()
  hasPassword(user: Pick<User, '$passwordHash'>): boolean {
    return user.$passwordHash.length > 0;
  }
}
```

宣言したフィールドに `@ResolveField` がない場合や、`@ResolveField` に対応する宣言がない場合は、[GraphQL の契約](./graphql.md#runtime-contract)のとおりビルドエラーになります。

### カラムを別の形で公開する {#replace-field}

カラムの値を変換して公開したい場合は、カラムを `hidden` にし、同じ名前のフィールドを宣言して `@ResolveField` で解決します。上のスキーマの `posts.createdAt` はこの例です。

```ts
// @filename: graphql-drizzle/src/graphql/post.resolver.ts
import { Resolver, ResolveField } from '@zeltjs/graphql';
import { GeneratedPostResolver, type Post } from '../generated/drizzle-graphql';
// ---cut---
declare module '../generated/drizzle-graphql' {
  interface Post {
    readonly createdAt: string;
  }
}

@Resolver()
export class PostResolver extends GeneratedPostResolver {
  @ResolveField()
  createdAt(post: Pick<Post, '$createdAt'>): string {
    return post.$createdAt.toISOString();
  }
}
```

`hidden` にしていないカラムと同じ名前のフィールドは追加できません。型が異なれば TypeScript の型エラーに、型が同じでも供給元が重複するためビルドエラーになります。暗黙の上書きは起きません。

## カラムの型 {#column-types}

公開できるカラムは、Drizzle が推論する TypeScript の型が次のいずれかのものです。

| TypeScript の型 | GraphQL の型 |
| --- | --- |
| `string` | `String` |
| `number` | `Float` |
| `boolean` | `Boolean` |
| 上記の配列 | `[T!]` |
| 上記の `\| null`（`notNull()` なし） | nullable |

`$type<>()` で brand を付けた `string` / `number`（`UserId` など）は、元の型として公開されます。

上記以外の型（`Date`、`bigint`、JSON、文字列リテラルのユニオンなど）のカラムを公開しようとすると、ビルド時にエラーになります。`hidden` にして、[別の形で公開](#replace-field)してください。

## リレーション {#relations}

| Drizzle の定義 | モデルのプロパティ | GraphQL |
| --- | --- | --- |
| `many(posts)` | `readonly Post[]` | `[Post!]!` |
| `one(users, …)`、`fields` がすべて `notNull()` | `User` | `User!` |
| `one(users, …)`、`fields` に nullable なカラムを含む | `User \| null` | `User` |
| `one(users)`（`fields` を持たない逆向きの `one`） | `User \| null` | `User` |

- `many` は関連先の主キーの昇順で返します。関連先がなければ空配列です。
- `one` で `fields` がすべて `notNull()` の場合は、参照先が必ず存在することを前提とします。外部キー制約で参照整合性を保ってください。参照先が存在しない行があると GraphQL エラーになります。
- リレーションの取得は、同じ GraphQL operation 内の親をまとめて、リレーションごとに 1 回のクエリで行います。カラムの取得も、モデルごとに ID をまとめて 1 回のクエリで行います。
- リレーションに引数（件数制限・並び順・絞り込み）は付けられません。必要な場合は `relations()` から外し、`@Relation` を自分で書いてください。

## スキーマを変更したとき {#schema-changes}

| 変更 | 次のビルドでの結果 |
| --- | --- |
| カラム・テーブル・リレーションを追加 | GraphQL に追加される（`hidden` を付けたものを除く） |
| カラムを削除・改名 | GraphQL から消える。そのカラムに依存する `Pick` や resolver は型エラー |
| カラムの型を変更 | モデル型が変わる。合わない resolver は型エラー |
| `hidden` を付ける | GraphQL から消え、`$` 付きの名前に変わる。元の名前に依存する resolver は型エラー |
| テーブルを `hidden` にする | モデルと、そこへのリレーションが消える。継承している resolver はエラー |

GraphQL スキーマの変更がクライアントに与える影響（フィールドの削除など）は、このパッケージでは検出しません。

## ビルド時に検出するエラー {#build-errors}

次の場合、`zelt build` / `zelt dev` は生成または解析の段階でエラーにします。

- 公開するテーブルに単一カラムの主キーがない（複合主キー・主キーなし）
- 公開するテーブルの主キーが文字列型でない（整数など）
- 公開するテーブルが、主キー以外に `id` というキーのカラムを持つ
- 公開するカラムの型が[対応表](#column-types)にない
- カラムとリレーションのキー名が重複している
- 2 つのテーブルの GraphQL 型名が重複している
- 公開するモデルを継承した resolver が `graphql()` に登録されていない、または 2 つ以上登録されている
- `hidden` でないカラムやリレーションと同じ名前のフィールドを追加した
- 追加したフィールドの宣言と `@ResolveField` が対応していない

## 現在の対応範囲 {#limitations}

- 多対多のリレーションを直接は表現できません。中間テーブルを公開し、2 段のリレーションとしてたどります（中間テーブルにも単一カラムの主キーが必要です）。
- MySQL は対象外です。
- 生成するのは読み取りだけです。Mutation は通常の `@Mutation` として書いてください。
