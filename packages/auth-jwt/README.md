# @zeltjs/auth-jwt

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

JWT authentication middleware for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/auth-jwt @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Get, inject } from '@zeltjs/core';
import { JwtConfig, JwtMiddleware, JwtService } from '@zeltjs/auth-jwt';

@Controller('/protected')
class ProtectedController {
  constructor(private jwt = inject(JwtService)) {}

  @Get('/')
  secret() {
    return { message: 'Secret data' };
  }
}

const app = createApp({
  http: {
    controllers: [ProtectedController],
    middlewares: [JwtMiddleware],
  },
  configs: [JwtConfig],
});
```
