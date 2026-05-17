---
---

# Event Bus

The `@zeltjs/eventbus` package provides a type-safe event bus with memory and Redis adapters for pub/sub messaging.

## Installation

```bash
pnpm add @zeltjs/eventbus
```

For Redis support:

```bash
pnpm add @zeltjs/eventbus @zeltjs/redis ioredis
```

## Overview

The event bus enables decoupled communication between components through publish/subscribe messaging. Events are fully typed via TypeScript declaration merging.

## Defining Events

Extend the `EventBusSchema` interface to define your events:

```typescript
// @noErrors
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
    'order.placed': { orderId: string; total: number };
    'notification.send': { to: string; message: string };
  }
}
```

This provides full type safety for event names and payloads.

## Memory Adapter

For single-process applications, use the in-memory adapter:

```typescript
// @noErrors
import { Injectable, inject } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';

@Injectable()
export class NotificationService {
  constructor(private eventBus = inject(MemoryEventBusAdaptor)) {}

  async setup() {
    this.eventBus.on('user.created', (data) => {
      console.log(`Welcome email sent to ${data.email}`);
    });
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

## Redis Adapter

For distributed applications, use the Redis adapter:

```typescript
// @noErrors
import { Injectable, inject } from '@zeltjs/core';
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';

@Injectable()
export class OrderService {
  constructor(private eventBus = inject(RedisEventBusAdaptor)) {}

  async placeOrder(items: OrderItem[]) {
    const orderId = crypto.randomUUID();
    const total = items.reduce((sum, item) => sum + item.price, 0);

    await this.eventBus.emit('order.placed', { orderId, total });
    return { orderId };
  }
}
```

The Redis adapter requires `@zeltjs/redis` to be configured:

```typescript
// @noErrors
import { createApp, EnvConfig } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';

const app = createApp({
  http: {
    controllers: [OrderController],
  },
  configs: [EnvConfig, RedisConfig],
});
```

## API Reference

### EventBusAdaptor Interface

Both adapters implement this interface:

| Method | Description |
|--------|-------------|
| `emit(event, data)` | Publish an event with payload |
| `on(event, handler)` | Subscribe to an event. Returns unsubscribe function |
| `once(event, handler)` | Subscribe to an event once. Returns unsubscribe function |

### MemoryEventBusAdaptor

In-memory event bus using Node.js EventEmitter. Events are local to the process.

```typescript
// @noErrors
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
```

### RedisEventBusAdaptor

Redis-backed event bus using pub/sub. Events are distributed across processes.

```typescript
// @noErrors
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';
```

## Unsubscribing

Both `on()` and `once()` return an unsubscribe function:

```typescript
// @noErrors
const unsubscribe = eventBus.on('user.created', (data) => {
  console.log(data.email);
});

// Later, stop listening
unsubscribe();
```

## Best Practices

### Event Naming

Use dot notation for event names: `domain.action`

```typescript
// @noErrors
interface EventBusSchema {
  'user.created': { userId: string };
  'user.updated': { userId: string; changes: string[] };
  'user.deleted': { userId: string };
  'order.placed': { orderId: string };
  'order.shipped': { orderId: string; trackingNumber: string };
}
```

### Idempotent Handlers

Design event handlers to be idempotent — safe to run multiple times with the same data:

```typescript
// @noErrors
eventBus.on('order.placed', async (data) => {
  const existing = await db.query.notifications.findFirst({
    where: eq(notifications.orderId, data.orderId),
  });

  if (existing) return;

  await db.insert(notifications).values({
    orderId: data.orderId,
    type: 'order_confirmation',
  });
});
```

### Error Handling

Wrap handlers in try-catch to prevent errors from affecting other subscribers:

```typescript
// @noErrors
eventBus.on('user.created', async (data) => {
  try {
    await sendWelcomeEmail(data.email);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
});
```
