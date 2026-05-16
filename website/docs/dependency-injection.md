---
---

# Dependency Injection

:::info Coming Soon
Detailed dependency injection documentation is under development.
:::

Zelt uses [needle-di](https://github.com/nicosommi/needle-di) under the hood for dependency injection, providing a lightweight and type-safe DI container.

## Quick Overview

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

See the [Services](./services) documentation for practical usage patterns.
