---
---

# BullMQの利用

[BullMQ](https://docs.bullmq.io/) はRedisを基盤とした、Node.js向けの強力なジョブキューライブラリです。このガイドでは、依存性の注入とライフサイクル管理を使ってBullMQをZeltと統合する方法を示します。

## インストール {#installation}

```bash
pnpm add bullmq ioredis
```

## 基本的なセットアップ {#basic-setup}

Redis接続を管理し、BullMQクライアントを公開するserviceを作成します:

```typescript
import { Injectable, inject, Config, Env, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { Redis, type RedisOptions } from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
// ---cut---
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;

  constructor(private env = inject(Env)) {}

  get connection(): RedisOptions {
    return {
      host: this.env.getString('REDIS_HOST', 'localhost'),
      port: this.env.getNumber('REDIS_PORT', 6379),
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

## Queueの作成 {#creating-queues}

`BullMQService` をinjectし、共有接続を使ってqueueを作成します:

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

## Workerの作成 {#creating-workers}

Workerはqueueからjobを処理します。graceful shutdownのためにlifecycle managerへ登録します:

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

## Controllerでの利用 {#using-in-controllers}

HTTP controllerからjobをenqueueします:

```typescript
import { Controller, Post, inject } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import * as v from 'valibot';
declare class EmailService { sendWelcomeEmail(to: string): Promise<void>; }
// ---cut---
@Controller('/users')
class UserController {
  constructor(private emailService = inject(EmailService)) {}

  @Post('/register')
  async register(req = request(v.object({ email: v.string() }))) {
    const body = await req.body();

    // ... ユーザーを作成する

    await this.emailService.sendWelcomeEmail(body.email);

    return { message: 'User registered' };
  }
}
```

## アプリ設定 {#app-configuration}

serviceをアプリに登録します:

```typescript
import { createApp, Config, Env, inject, http } from '@zeltjs/core';
type ConnectionOptions = { host?: string; port?: number };
declare class UserController {}
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(private env = inject(Env)) {}
  get connection(): ConnectionOptions { return { host: 'localhost', port: 6379 }; }
}
// ---cut---
const app = createApp([http({ controllers: [UserController] })], { configs: [BullMQConfig] });

export default app;
```

workerを開始するには、起動時にインスタンス化されるようにします:

```typescript
import { createApp, inject, Config, Env, http } from '@zeltjs/core';
type ConnectionOptions = { host?: string; port?: number };
declare class UserController {}
declare class EmailWorker {}
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(private env = inject(Env)) {}
  get connection(): ConnectionOptions { return { host: 'localhost', port: 6379 }; }
}
// ---cut---
const app = createApp([http({ controllers: [UserController] })], { configs: [BullMQConfig] });

// workerをインスタンス化して処理を開始する
const readyApp = await app.createRuntime();
await readyApp.get(EmailWorker);
```

## カスタム設定 {#custom-configuration}

環境ごとに異なる設定を使うために `BullMQConfig` を継承します:

```typescript
import { Config, Env, inject } from '@zeltjs/core';
type ConnectionOptions = { host?: string; port?: number; password?: string; tls?: object };
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(protected env = inject(Env)) {}
  get connection(): ConnectionOptions { return { host: 'localhost', port: 6379 }; }
}
// ---cut---
@Config
class ProductionBullMQConfig extends BullMQConfig {
  override get connection(): ConnectionOptions {
    return {
      host: this.env.getRequired('REDIS_HOST'),
      port: this.env.getNumber('REDIS_PORT', 6379),
      password: this.env.getString('REDIS_PASSWORD') || undefined,
      tls: this.env.getBoolean('REDIS_TLS') ? {} : undefined,
    };
  }
}
```

## Jobのオプション {#job-options}

BullMQは多くのjobオプションをサポートしています。そのまま使ってください:

```typescript
import { Queue } from 'bullmq';

const queue = new Queue('reports', { connection: { host: 'localhost', port: 6379 } });
// ---cut---
await queue.add('report', { userId: 123 }, {
  delay: 60000,                    // 1分遅延させる
  attempts: 5,                     // 5回リトライする
  backoff: { type: 'exponential', delay: 2000 },
  priority: 1,                     // 優先度を上げる
  removeOnComplete: 100,           // 完了済みを直近100件保持する
  removeOnFail: 50,                // 失敗を直近50件保持する
});
```

## スケジュールされたJob {#scheduled-jobs}

繰り返し実行されるjobには、BullMQのrepeat機能を使います:

```typescript
import { Queue } from 'bullmq';

const queue = new Queue('reports', { connection: { host: 'localhost', port: 6379 } });
// ---cut---
await queue.add('daily-report', {}, {
  repeat: {
    pattern: '0 9 * * *',          // 毎日9:00に
    tz: 'Asia/Tokyo',
  },
});
```

## モニタリング {#monitoring}

queueをモニタリングするには [Bull Board](https://github.com/felixmosh/bull-board) や [Arena](https://github.com/bee-queue/arena) を使ってください。これらはBullMQと直接統合します。

## テスト {#testing}

テストでは、別のRedisインスタンスを使うか、queueをmockします:

```typescript
import { describe, it, vi, expect } from 'vitest';
import { Injectable } from '@zeltjs/core';
import { Queue } from 'bullmq';
declare class BullMQService { readonly client: unknown; }
@Injectable()
class EmailService {
  private readonly queue: Queue;
  constructor(bullmq: Pick<BullMQService, 'client'>) {
    this.queue = new Queue('email', { connection: bullmq.client as any });
  }
  async sendWelcomeEmail(to: string): Promise<void> {
    await this.queue.add('welcome', { to, subject: 'Welcome!', body: '...' });
  }
}
// ---cut---
describe('EmailService', () => {
  it('enqueues welcome email', async () => {
    const mockQueue = { add: vi.fn() };
    const service = new EmailService({ client: {} });
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

integration testでは、テスト用config overrideとともにTestcontainersを使います:

```typescript
import { Config, Env, inject } from '@zeltjs/core';
declare class GenericContainer {
  constructor(image: string);
  withExposedPorts(port: number): this;
  start(): Promise<{ getHost(): string; getMappedPort(port: number): number }>;
}
type ConnectionOptions = { host?: string; port?: number };
@Config
class BullMQConfig {
  static readonly Token = BullMQConfig;
  constructor(protected env = inject(Env)) {}
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

// テストのapp setupでTestBullMQConfigを使う
```
