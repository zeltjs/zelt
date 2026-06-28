# @zeltjs/validator-valibot

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Valibot validation integration for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/validator-valibot valibot @zeltjs/core
```

## Usage

```typescript
import { Controller, Post } from '@zeltjs/core';
import { request } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

@Controller('/users')
class UserController {
  @Post('/')
  async create(req = request(CreateUserSchema)) {
    const data = await req.body();
    return { user: data };
  }
}
```
