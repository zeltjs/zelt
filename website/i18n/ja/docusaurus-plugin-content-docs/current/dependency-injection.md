---
---

# Dependency Injection

:::info 近日対応予定
依存性注入(DI)の詳細なドキュメントは現在準備中です。
:::

Zeltは内部で[needle-di](https://github.com/nicosommi/needle-di)を利用して依存性注入を行っており、軽量で型安全なDIコンテナを提供しています。

## Quick Overview {#quick-overview}

```typescript
import { Injectable, inject } from '@zeltjs/core';
// ---cut---
@Injectable()
export class DatabaseService {
  query(sql: string) {
    // ...
  }
}

@Injectable()
export class UserRepository {
  constructor(private db = inject(DatabaseService)) {}

  findAll() {
    return this.db.query('SELECT * FROM users');
  }
}
```

実践的な使用パターンについては[Services](./services)のドキュメントを参照してください。

## Decorator Composition {#decorator-composition}

Zeltは、複数のデコレータを1つのメタデコレータへ組み合わせるユーティリティを提供しています。これは、関連する機能をまとめた再利用可能なカスタムデコレータを作る際に便利です。

### `composeClassDecorators` {#composeclassdecorators}

複数のクラスデコレータを1つに組み合わせます。

```typescript
import { Controller } from '@zeltjs/core';
import { createClassDecorator, composeClassDecorators } from '@zeltjs/decorator-metadata';
// ---cut---
const GraphqlController = (path: string) =>
  composeClassDecorators(
    Controller(path),
    createClassDecorator({ decorator: 'GraphqlController' })
  );

@GraphqlController('/api')
class UserResolver {}
```

### `composeMethodDecorators` {#composemethoddecorators}

複数のメソッドデコレータを1つに組み合わせます。

```typescript
import {
  createClassDecorator,
  createMethodDecorator,
  composeMethodDecorators,
} from '@zeltjs/decorator-metadata';
// ---cut---
const Controller = () => createClassDecorator({});
const Route = (method: string, path: string) =>
  createMethodDecorator({ decorator: 'Route', method, path });

const Query = (path: string) =>
  composeMethodDecorators(
    Route('GET', path),
    createMethodDecorator({ decorator: 'Query' })
  );

@Controller()
class TestController {
  @Query('/users')
  getUsers() {}
}
```

### `composePropertyDecorators` {#composepropertydecorators}

複数のプロパティデコレータを1つに組み合わせます。

```typescript
import {
  createClassDecorator,
  createPropertyDecorator,
  composePropertyDecorators,
} from '@zeltjs/decorator-metadata';
// ---cut---
const Entity = () => createClassDecorator({});
const Column = (opts?: { nullable?: boolean }) =>
  createPropertyDecorator({ decorator: 'Column', nullable: opts?.nullable ?? false });
const Searchable = () => createPropertyDecorator({ decorator: 'Searchable' });

const SearchableColumn = (opts?: { nullable?: boolean }) =>
  composePropertyDecorators(Column(opts), Searchable());

@Entity()
class User {
  @SearchableColumn()
  name!: string;
}
```

### How It Works {#how-it-works}

- **Propsはマージされる**: 各デコレータのpropsは順番にmetadataへ追加されます
- **Traceは使用箇所を指す**: ソース位置のtraceは、合成されたデコレータが適用された箇所(`composeClassDecorators`ならクラス定義、`composeMethodDecorators`ならメソッド、`composePropertyDecorators`ならプロパティ)を指し、デコレータファクトリが定義された箇所は指しません
- **ユースケース**: より簡潔で意味の明確なコードのために、複数のデコレータをまとめたカスタムメタデコレータを作成する
