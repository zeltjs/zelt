# @zeltjs/decorator-metadata

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Runtime decorator metadata capture and TypeScript type extraction for TC39 decorators.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
pnpm add @zeltjs/decorator-metadata
```

## Usage

### Runtime API

```typescript
import {
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
} from '@zeltjs/decorator-metadata';

// Create custom decorators
const Controller = (basePath: string) =>
  createClassDecorator({ basePath });

const Get = (path: string) =>
  createMethodDecorator({ method: 'GET', path });

// Use decorators
@Controller('/users')
class UserController {
  @Get('/:id')
  getUser(id: string): User {
    // ...
  }
}
```

### Inspect API

```typescript
import { getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';

const result = await getTypeMetadata(UserController, {
  tsconfig: './tsconfig.json',
  expandStrategy: 'exported-only',
});

if (result.isOk()) {
  console.log(result.value);
  // {
  //   name: 'UserController',
  //   props: { basePath: '/users' },
  //   methods: [{ name: 'getUser', params: [...], returnType: {...} }],
  //   properties: []
  // }
}
```

## License

MIT
