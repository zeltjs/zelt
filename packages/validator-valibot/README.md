# @zeltjs/validator-valibot

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Valibot validation integration for Zelt applications.

## Installation

```bash
npm install @zeltjs/validator-valibot valibot @zeltjs/core
```

## Usage

```typescript
import { Controller, Post } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

@Controller('/users')
class UserController {
  @Post('/')
  create(data = validated(CreateUserSchema)) {
    return { user: data };
  }
}
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
