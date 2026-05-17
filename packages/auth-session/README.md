# @zeltjs/auth-session

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Session management middleware for Zelt applications.

## Installation

```bash
npm install @zeltjs/auth-session @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { SessionConfig, SessionMiddleware, getSession, setSession } from '@zeltjs/auth-session';

@Controller('/auth')
class AuthController {
  @Get('/me')
  me() {
    const session = getSession();
    return { user: session?.user };
  }
}

const app = createApp({
  http: {
    controllers: [AuthController],
    middlewares: [SessionMiddleware],
  },
  configs: [SessionConfig],
});
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
