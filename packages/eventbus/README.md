# @zeltjs/eventbus

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Event bus abstraction for Zelt applications.

## Installation

```bash
npm install @zeltjs/eventbus @zeltjs/core
```

## Usage

```typescript
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
import type { EventBusSchema } from '@zeltjs/eventbus';

type MyEvents = EventBusSchema<{
  'user.created': { id: string; name: string };
  'user.deleted': { id: string };
}>;

const eventbus = new MemoryEventBusAdaptor<MyEvents>();

eventbus.on('user.created', (data) => {
  console.log('User created:', data.name);
});

eventbus.emit('user.created', { id: '1', name: 'Alice' });
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
