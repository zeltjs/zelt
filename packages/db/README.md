# @zeltjs/db

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

ORM-agnostic database abstraction with transaction propagation for Zelt applications.

## Installation

```bash
npm install @zeltjs/db @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Post, inject } from '@zeltjs/core';
import { DbConfig, DatabaseService, createTransactionDecorator } from '@zeltjs/db';

const Transactional = createTransactionDecorator();

@Controller('/users')
class UserController {
  constructor(private db = inject(DatabaseService)) {}

  @Post('/')
  @Transactional()
  createUser() {
    // runs within a transaction
  }
}

const app = createApp({
  http: { controllers: [UserController] },
  configs: [DbConfig],
});
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
