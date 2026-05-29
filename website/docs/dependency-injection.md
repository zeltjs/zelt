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

## Decorator Composition

Zelt provides utilities to combine multiple decorators into a single meta-decorator. This is useful for creating reusable custom decorators that bundle related functionality.

### `composeClassDecorators`

Combines multiple class decorators into one.

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

### `composeMethodDecorators`

Combines multiple method decorators into one.

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

### `composePropertyDecorators`

Combines multiple property decorators into one.

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

### How It Works

- **Props are merged**: Each decorator's props are appended to the metadata in order
- **Trace points to usage**: The source position trace points to where the composed decorator is applied (the class definition for `composeClassDecorators`, the method for `composeMethodDecorators`, or the property for `composePropertyDecorators`), not where the decorator factory was defined
- **Use case**: Create custom meta-decorators that bundle multiple decorators for cleaner, more semantic code
