# @zeltjs/eventbus

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Event bus abstraction for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/eventbus @zeltjs/core
```

## Usage

Declare your event schema by augmenting `EventBusSchema`:

```typescript
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'order:created': { orderId: number; userId: number };
  }
}

export {};
```

Register the `eventbus` feature with an adaptor in `createApp`:

```typescript
import { createApp } from '@zeltjs/core';
import { eventbus, MemoryEventBusAdaptor } from '@zeltjs/eventbus';

const app = createApp([eventbus({ adaptor: MemoryEventBusAdaptor })]);
const runtime = await app.createRuntime();

runtime.eventbus.on('order:created', (data) => {
  console.log('Order created:', data.orderId);
});

await runtime.eventbus.emit('order:created', { orderId: 1, userId: 2 });
```

Subscribers are ordinary `Lifecycle` classes: subscribe in `startup()`, unsubscribe in `shutdown()`, and pass them as `handlers` so the feature resolves and starts them:

```typescript
import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';

@Injectable()
class OrderHandlers implements Lifecycle {
  private unsubscribes: Array<() => void> = [];

  constructor(
    private readonly eventBus = inject(MemoryEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    const unsub = this.eventBus.on('order:created', (data) => {
      // handle event
    });
    this.unsubscribes.push(unsub);
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }
}

const app = createApp([
  eventbus({ adaptor: MemoryEventBusAdaptor, handlers: [OrderHandlers] }),
]);
```

Use `RedisEventBusAdaptor` from `@zeltjs/eventbus/adaptor-redis` in place of `MemoryEventBusAdaptor` to fan events out across processes via Redis pub/sub.
