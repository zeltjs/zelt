---
---

# Event Bus

The `@zeltjs/eventbus` package provides a type-safe event bus with memory and Redis adapters for pub/sub messaging.

## Installation

```bash
pnpm add @zeltjs/eventbus @zeltjs/core
```

For Redis support:

```bash
pnpm add @zeltjs/eventbus @zeltjs/core @zeltjs/redis
```

## Overview

The event bus enables decoupled communication between components through publish/subscribe messaging. Events are fully typed via TypeScript declaration merging.

## Defining Events

Extend the `EventBusSchema` interface to define your events:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
// ---cut---
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
    'order.placed': { orderId: string; total: number };
    'notification.send': { to: string; message: string };
  }
}
```

This provides full type safety for event names and payloads.

## App Setup

Register the `eventbus` feature in `createApp`. It takes an `adaptor` class (the adapter to use for publishing and subscribing) and an optional `handlers` array of subscriber classes:

```typescript twoslash
import { Injectable, inject, LifecycleManager, createApp, http } from '@zeltjs/core';
import type { Lifecycle } from '@zeltjs/core';
import { MemoryEventBusAdaptor, eventbus } from '@zeltjs/eventbus';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

@Injectable()
class NotificationHandlers implements Lifecycle {
  private unsubscribes: Array<() => void> = [];

  constructor(
    private readonly eventBus = inject(MemoryEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    const unsub = this.eventBus.on('user.created', (data) => {
      console.log(`Welcome email sent to ${data.email}`);
    });
    this.unsubscribes.push(unsub);
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }
}
// ---cut---
const app = createApp([
  http({ controllers: [] }),
  eventbus({ adaptor: MemoryEventBusAdaptor, handlers: [NotificationHandlers] }),
]);
```

`adaptor` selects which `EventBusAdaptor` implementation backs `emit`/`on`/`once` for handlers that inject it directly. `handlers` lists subscriber classes that nothing else in the app depends on — without listing them here, they would never be constructed and their `startup()` subscriptions would never run.

## Subscribing with Lifecycle

Subscriber classes implement `Lifecycle` from `@zeltjs/core`: they subscribe in `startup()` and keep the returned unsubscribe functions to call in `shutdown()`.

```typescript twoslash
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import type { Lifecycle } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
// ---cut---
@Injectable()
export class NotificationHandlers implements Lifecycle {
  private unsubscribes: Array<() => void> = [];

  constructor(
    private readonly eventBus = inject(MemoryEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    const unsub = this.eventBus.on('user.created', (data) => {
      console.log(`Welcome email sent to ${data.email}`);
    });
    this.unsubscribes.push(unsub);
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }
}

@Injectable()
export class UserService {
  constructor(private eventBus = inject(MemoryEventBusAdaptor)) {}

  async createUser(email: string) {
    const userId = crypto.randomUUID();
    await this.eventBus.emit('user.created', { userId, email });
    return { userId };
  }
}
```

`UserService` publishes events by injecting the same adapter class directly — publishers don't need to be listed in `handlers`, since `emit` doesn't require the class to be pre-constructed by the feature.

## Memory Adapter

For single-process applications, use the in-memory adapter. `MemoryEventBusAdaptor` is built on [mitt](https://github.com/developit/mitt); events are local to the process and lost on restart:

```typescript twoslash
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
```

## Redis Adapter

For distributed applications, use the Redis adapter. `RedisEventBusAdaptor` implements `Lifecycle` itself. It duplicates the `@zeltjs/redis` client into a dedicated subscriber connection when constructed (clients are created with `lazyConnect`, so this performs no I/O), `startup()` opens that connection, `on()` subscribes a channel the first time it's used for an event, and `shutdown()` disconnects the subscriber connection.

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { Injectable, inject } from '@zeltjs/core';
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'order.placed': { orderId: string; total: number };
  }
}
// ---cut---
@Injectable()
export class OrderService {
  constructor(private eventBus = inject(RedisEventBusAdaptor)) {}

  async placeOrder(items: { price: number }[]) {
    const orderId = crypto.randomUUID();
    const total = items.reduce((sum, item) => sum + item.price, 0);

    await this.eventBus.emit('order.placed', { orderId, total });
    return { orderId };
  }
}
```

The Redis adapter requires `@zeltjs/redis` to be configured. Register `RedisConfig` alongside the `eventbus` feature:

```typescript twoslash
import { Injectable, inject, LifecycleManager, createApp, http } from '@zeltjs/core';
import type { Lifecycle } from '@zeltjs/core';
import { eventbus } from '@zeltjs/eventbus';
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'order.placed': { orderId: string; total: number };
  }
}

@Injectable()
class OrderHandlers implements Lifecycle {
  private unsubscribes: Array<() => void> = [];

  constructor(
    private readonly eventBus = inject(RedisEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    const unsub = this.eventBus.on('order.placed', (data) => {
      console.log(`Order ${data.orderId} placed for ${data.total}`);
    });
    this.unsubscribes.push(unsub);
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }
}
// ---cut---
const app = createApp(
  [
    http({ controllers: [] }),
    eventbus({ adaptor: RedisEventBusAdaptor, handlers: [OrderHandlers] }),
  ],
  { configs: [RedisConfig] },
);
```

`@zeltjs/redis` is an optional peer dependency of `@zeltjs/eventbus` — only install it when you use `RedisEventBusAdaptor`. See [Redis KV Driver](./kv-redis.md) for customizing `RedisConfig` (connection URL, retry strategy, and so on).

## API Reference

### eventbus(options)

Registers the event bus feature. Adds it to the app under the `eventbus` key.

| Option | Description |
|--------|--------------|
| `adaptor` | The `EventBusAdaptor` class to construct and expose (`MemoryEventBusAdaptor` or `RedisEventBusAdaptor`) |
| `handlers` | Optional subscriber classes to force-construct at startup, so their `Lifecycle.startup()` subscriptions run |

### EventBusAdaptor Interface

Both adapters implement this interface:

| Method | Description |
|--------|-------------|
| `emit(event, data)` | Publish an event with payload |
| `on(event, handler)` | Subscribe to an event. Returns unsubscribe function |
| `once(event, handler)` | Subscribe to an event once. Returns unsubscribe function |

### MemoryEventBusAdaptor

In-memory event bus built on [mitt](https://github.com/developit/mitt). Events are local to the process.

```typescript twoslash
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
```

### RedisEventBusAdaptor

Redis-backed event bus using pub/sub. Events are distributed across processes.

```typescript twoslash
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';
```

## Unsubscribing

Both `on()` and `once()` return an unsubscribe function:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

const eventBus = new MemoryEventBusAdaptor();
// ---cut---
const unsubscribe = eventBus.on('user.created', (data) => {
  console.log(data.email);
});

// Later, stop listening
unsubscribe();
```

## Best Practices

### Event Naming

Use dot notation for event names: `domain.action`

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
// ---cut---
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string };
    'user.updated': { userId: string; changes: string[] };
    'user.deleted': { userId: string };
    'order.placed': { orderId: string };
    'order.shipped': { orderId: string; trackingNumber: string };
  }
}
```

### Idempotent Handlers

Design event handlers to be idempotent — safe to run multiple times with the same data:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
import { eq } from 'drizzle-orm';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'order.placed': { orderId: string; total: number };
  }
}

const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  type: text('type').notNull(),
});

const db = drizzle(postgres('postgres://localhost:5432/app'));

const eventBus = new MemoryEventBusAdaptor();
// ---cut---
eventBus.on('order.placed', async (data) => {
  const [existing] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.orderId, data.orderId))
    .limit(1);

  if (existing) return;

  await db.insert(notifications).values({
    orderId: data.orderId,
    type: 'order_confirmation',
  });
});
```

### Error Handling

Wrap handlers in try-catch to prevent errors from affecting other subscribers:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
import { Injectable } from '@zeltjs/core';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

@Injectable()
class MailService {
  async sendWelcome(email: string): Promise<void> {}
}

const mailService = new MailService();
const eventBus = new MemoryEventBusAdaptor();
// ---cut---
eventBus.on('user.created', async (data) => {
  try {
    await mailService.sendWelcome(data.email);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
});
```
