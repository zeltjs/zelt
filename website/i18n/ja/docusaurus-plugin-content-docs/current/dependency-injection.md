---
sidebar_position: 6
---

# 依存性注入

:::info 準備中
依存性注入の詳細なドキュメントは作成中です。
:::

Zeltは内部で[needle-di](https://github.com/nicosommi/needle-di)を使用し、軽量で型安全なDIコンテナを提供しています。

## 概要

```typescript
import { Injectable, inject } from '@zeltjs/core';

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

実践的な使用パターンについては[サービス](/services)のドキュメントを参照してください。
