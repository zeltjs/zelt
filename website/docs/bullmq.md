---
---

# Using BullMQ

[BullMQ](https://docs.bullmq.io/) is a powerful job queue library for Node.js backed by Redis. This guide shows how to integrate BullMQ with Zelt using dependency injection and lifecycle management.

## Installation

```bash
pnpm add bullmq ioredis
```

## Basic Setup

Create a service that manages the Redis connection and exposes the BullMQ client:

```typescript
import { Injectable, inject, Config, EnvConfig, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { Redis, type RedisOptions } from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
// ---cut---
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;

  constructor(private env = inject(EnvConfig)) {}

  get connection(): RedisOptions {
    return {
      host: this.env.get('REDIS_HOST') ?? 'localhost',
      port: Number(this.env.get('REDIS_PORT') ?? 6379),
    };
  }
}

@Injectable()
class BullMQService implements Lifecycle {
  readonly client: Redis;

  constructor(
    private config = inject(BullMQConfig),
    lifecycle = inject(LifecycleManager),
  ) {
    this.client = new Redis(this.config.connection);
    lifecycle.register(this);
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    await this.client.quit();
  }
}
```

## Creating Queues

Inject `BullMQService` and create queues using the shared connection:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
declare class BullMQService { readonly client: Redis; }
// ---cut---
@Injectable()
class EmailService {
  private readonly queue: Queue;

  constructor(bullmq = inject(BullMQService)) {
    this.queue = new Queue('email', { connection: bullmq.client });
  }

  async sendWelcomeEmail(to: string): Promise<void> {
    await this.queue.add('welcome', { to, subject: 'Welcome!', body: '...' });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    await this.queue.add('password-reset', { to, token }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
}
```

## Creating Workers

Workers process jobs from the queue. Register them with the lifecycle manager for graceful shutdown:

```typescript
import { Injectable, inject, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { Redis } from 'ioredis';
import { Worker, type Job } from 'bullmq';
declare class BullMQService { readonly client: Redis; }
declare class EmailClient {
  send(to: string, subject: string, body: string): Promise<void>;
  sendPasswordReset(to: string, token: string): Promise<void>;
}
type EmailJobData = { to: string; subject?: string; body?: string; token?: string };
// ---cut---
@Injectable()
class EmailWorker implements Lifecycle {
  private readonly worker: Worker<EmailJobData>;

  constructor(
    bullmq = inject(BullMQService),
    private emailClient = inject(EmailClient),
    lifecycle = inject(LifecycleManager),
  ) {
    this.worker = new Worker<EmailJobData>('email', this.process.bind(this), {
      connection: bullmq.client,
      concurrency: 5,
    });
    lifecycle.register(this);
  }

  private async process(job: Job<EmailJobData>): Promise<void> {
    switch (job.name) {
      case 'welcome':
        await this.emailClient.send(job.data.to, job.data.subject!, job.data.body!);
        break;
      case 'password-reset':
        await this.emailClient.sendPasswordReset(job.data.to, job.data.token!);
        break;
    }
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    await this.worker.close();
  }
}
```

## Using in Controllers

Enqueue jobs from your HTTP controllers:

```typescript
import { Controller, Post, inject } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';
declare class EmailService { sendWelcomeEmail(to: string): Promise<void>; }
// ---cut---
@Controller('/users')
class UserController {
  constructor(private emailService = inject(EmailService)) {}

  @Post('/register')
  async register() {
    const body = validated(v.object({ email: v.string() }));
    
    // ... create user
    
    await this.emailService.sendWelcomeEmail(body.email);
    
    return { message: 'User registered' };
  }
}
```

## App Configuration

Register your services in the app:

```typescript
import { createApp, Config, EnvConfig, inject } from '@zeltjs/core';
type ConnectionOptions = { host?: string; port?: number };
declare class UserController {}
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(private env = inject(EnvConfig)) {}
  get connection(): ConnectionOptions { return { host: 'localhost', port: 6379 }; }
}
// ---cut---
const app = createApp({
  controllers: [UserController],
  configs: [BullMQConfig],
});

export default app;
```

To start workers, ensure they are instantiated at startup:

```typescript
import { createApp, inject, Config, EnvConfig } from '@zeltjs/core';
type ConnectionOptions = { host?: string; port?: number };
declare class UserController {}
declare class EmailWorker {}
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(private env = inject(EnvConfig)) {}
  get connection(): ConnectionOptions { return { host: 'localhost', port: 6379 }; }
}
// ---cut---
const app = createApp({
  controllers: [UserController],
  configs: [BullMQConfig],
});

// Instantiate worker to start processing
app.ready().then(() => {
  inject(EmailWorker);
});
```

## Custom Configuration

Extend `BullMQConfig` for different environments:

```typescript
import { Config, EnvConfig, inject } from '@zeltjs/core';
type ConnectionOptions = { host?: string; port?: number; password?: string; tls?: object };
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(protected env = inject(EnvConfig)) {}
  get connection(): ConnectionOptions { return { host: 'localhost', port: 6379 }; }
}
// ---cut---
@Config
class ProductionBullMQConfig extends BullMQConfig {
  override get connection(): ConnectionOptions {
    return {
      host: this.env.get('REDIS_HOST')!,
      port: Number(this.env.get('REDIS_PORT') ?? 6379),
      password: this.env.get('REDIS_PASSWORD'),
      tls: this.env.get('REDIS_TLS') === 'true' ? {} : undefined,
    };
  }
}
```

## Job Options

BullMQ supports many job options. Use them directly:

```typescript
import { Queue } from 'bullmq';

const queue = new Queue('reports', { connection: { host: 'localhost', port: 6379 } });
// ---cut---
await queue.add('report', { userId: 123 }, {
  delay: 60000,                    // Delay 1 minute
  attempts: 5,                     // Retry 5 times
  backoff: { type: 'exponential', delay: 2000 },
  priority: 1,                     // Higher priority
  removeOnComplete: 100,           // Keep last 100 completed
  removeOnFail: 50,                // Keep last 50 failed
});
```

## Scheduled Jobs

For recurring jobs, use BullMQ's repeat feature:

```typescript
import { Queue } from 'bullmq';

const queue = new Queue('reports', { connection: { host: 'localhost', port: 6379 } });
// ---cut---
await queue.add('daily-report', {}, {
  repeat: {
    pattern: '0 9 * * *',          // Every day at 9:00
    tz: 'Asia/Tokyo',
  },
});
```

## Monitoring

Use [Bull Board](https://github.com/felixmosh/bull-board) or [Arena](https://github.com/bee-queue/arena) to monitor your queues. These integrate directly with BullMQ.

## Testing

For testing, use a separate Redis instance or mock the queue:

```typescript
import { describe, it, vi, expect } from 'vitest';
declare class EmailService {
  constructor(bullmq: { client: unknown });
  sendWelcomeEmail(to: string): Promise<void>;
}
// ---cut---
describe('EmailService', () => {
  it('enqueues welcome email', async () => {
    const mockQueue = { add: vi.fn() };
    const service = new EmailService({ client: {} } as any);
    (service as any).queue = mockQueue;

    await service.sendWelcomeEmail('test@example.com');

    expect(mockQueue.add).toHaveBeenCalledWith('welcome', {
      to: 'test@example.com',
      subject: 'Welcome!',
      body: '...',
    });
  });
});
```

For integration tests, use Testcontainers with a test config override:

```typescript
import { Config, EnvConfig, inject } from '@zeltjs/core';
declare class GenericContainer {
  constructor(image: string);
  withExposedPorts(port: number): this;
  start(): Promise<{ getHost(): string; getMappedPort(port: number): number }>;
}
type ConnectionOptions = { host?: string; port?: number };
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(protected env = inject(EnvConfig)) {}
  get connection(): ConnectionOptions { return { host: 'localhost', port: 6379 }; }
}
// ---cut---
const redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();

@Config
class TestBullMQConfig extends BullMQConfig {
  override get connection() {
    return {
      host: redis.getHost(),
      port: redis.getMappedPort(6379),
    };
  }
}

// Use TestBullMQConfig in your test app setup
```
