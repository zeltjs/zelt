---
---

# Scheduler

Zeltは、指定した間隔やcron式でタスクを実行するための宣言的なスケジューリングデコレータを提供します。

## 概要 {#overview}

scheduler APIは以下で構成されます:

- **`@Scheduled`** — クラスをschedulerとしてマークするクラスデコレータ
- **`@Cron(expression)`** — 特定のcron式で実行する
- **`@Daily({ hour, minute? })`** — 1日1回実行する
- **`@Hourly({ minute? })`** — 1時間に1回実行する
- **`@Weekly({ day, hour, minute? })`** — 週に1回実行する
- **`@Every({ minutes | seconds })`** — 固定間隔で実行する

## 基本的な使い方 {#basic-usage}

### Schedulerの作成 {#creating-a-scheduler}

```typescript
import { Scheduled, Cron, Daily, Hourly } from '@zeltjs/core';

@Scheduled()
class ReportScheduler {
  @Daily({ hour: 9 })
  async sendDailyReport() {
    console.log('Sending daily report...');
  }

  @Hourly()
  async checkHealth() {
    console.log('Health check...');
  }
}
```

### Schedulerの登録 {#registering-schedulers}

`scheduler([ReportScheduler])` は、`http({ controllers: [...] })` と同じように `createApp()` に渡すfeature配列へ含めます:

```typescript
import { createApp, Controller, Get, Scheduled, Daily, Hourly, http, scheduler } from '@zeltjs/core';

@Controller('/users') class UserController { @Get('/') findAll() { return { users: [] }; } }
@Scheduled() class ReportScheduler {
  @Daily({ hour: 9 }) async sendDailyReport() { console.log('Sending daily report...'); }
  @Hourly() async checkHealth() { console.log('Health check...'); }
}
// ---cut---
const app = createApp([http({ controllers: [UserController] }), scheduler([ReportScheduler])]);
```

### Schedulerの起動 {#starting-the-scheduler}

`scheduler([ReportScheduler])` を `createApp()` のfeature配列に含めた後、`onNode()` と `createRuntime()` が完了したら `schedulers.startScheduler()` を呼び出してscheduled taskを開始します:

```typescript
import { createApp, Controller, Get, Scheduled, Daily, Hourly, http, scheduler } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Controller('/users') class UserController { @Get('/') findAll() { return { users: [] }; } }
@Scheduled() class ReportScheduler {
  @Daily({ hour: 9 }) async sendDailyReport() {}
  @Hourly() async checkHealth() {}
}

const app = createApp([http({ controllers: [UserController] }), scheduler([ReportScheduler])]);
const nodeApp = await onNode(app);
// ---cut---
await nodeApp.schedulers.startScheduler();
```

`scheduler([ReportScheduler])` を含むappでschedulerをgracefulに停止するには:

```typescript
import { createApp, Controller, Get, Scheduled, Daily, Hourly, http, scheduler } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Controller('/users') class UserController { @Get('/') findAll() { return { users: [] }; } }
@Scheduled() class ReportScheduler {
  @Daily({ hour: 9 }) async sendDailyReport() {}
  @Hourly() async checkHealth() {}
}

const app = createApp([http({ controllers: [UserController] }), scheduler([ReportScheduler])]);
const nodeApp = await onNode(app);
// ---cut---
await nodeApp.schedulers.stopScheduler();
```

schedulerはappがreadyになっても**自動的には起動しません**。この設計により以下が可能です:

- scheduled taskなしでHTTPサーバーを実行する(テスト時など)
- schedulerのライフサイクルをサーバーとは独立して制御する
- 環境に応じて条件付きでschedulingを有効化する

## デコレータリファレンス {#decorator-reference}

### @Cron {#cron}

特定のcron式で実行します:

```typescript
import { Scheduled, Cron } from '@zeltjs/core';
// ---cut---
@Scheduled()
class BackupScheduler {
  @Cron('0 2 * * *')
  async runBackup() {
    // 毎日午前2:00に実行される
  }

  @Cron('*/5 * * * *')
  async quickCheck() {
    // 5分ごとに実行される
  }
}
```

タイムゾーン指定あり:

```typescript
import { Scheduled, Cron } from '@zeltjs/core';
// ---cut---
@Scheduled()
class TimezoneScheduler {
  @Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
  async morningTask() {
    // 日本標準時の午前9:00に実行される
  }
}
```

### @Daily {#daily}

指定した時刻に1日1回実行します:

```typescript
import { Scheduled, Daily } from '@zeltjs/core';
// ---cut---
@Scheduled()
class DailyTasks {
  @Daily({ hour: 6 })
  async earlyMorning() {
    // 午前6:00に実行される
  }

  @Daily({ hour: 23, minute: 30 })
  async lateNight() {
    // 午後11:30に実行される
  }

  @Daily({ hour: 9, tz: 'America/New_York' })
  async newYorkMorning() {
    // EST/EDTの午前9:00に実行される
  }
}
```

### @Hourly {#hourly}

1時間に1回実行します:

```typescript
import { Scheduled, Hourly } from '@zeltjs/core';
// ---cut---
@Scheduled()
class HourlyTasks {
  @Hourly()
  async everyHour() {
    // 毎時0分に実行される
  }

  @Hourly({ minute: 30 })
  async halfPast() {
    // 毎時30分に実行される
  }
}
```

### @Weekly {#weekly}

週に1回実行します:

```typescript
import { Scheduled, Weekly } from '@zeltjs/core';
// ---cut---
@Scheduled()
class WeeklyTasks {
  @Weekly({ day: 'monday', hour: 9 })
  async mondayMeeting() {
    // 毎週月曜日の午前9:00に実行される
  }

  @Weekly({ day: 'friday', hour: 17, minute: 30 })
  async weeklyReport() {
    // 毎週金曜日の午後5:30に実行される
  }
}
```

利用可能な曜日: `'sunday'`、`'monday'`、`'tuesday'`、`'wednesday'`、`'thursday'`、`'friday'`、`'saturday'`

### @Every {#every}

固定間隔で実行します:

```typescript
import { Scheduled, Every } from '@zeltjs/core';
// ---cut---
@Scheduled()
class PollingTasks {
  @Every({ minutes: 5 })
  async pollApi() {
    // 5分ごとに実行される
  }

  @Every({ seconds: 30 })
  async frequentCheck() {
    // 30秒ごとに実行される
  }
}
```

## 依存性の注入 {#dependency-injection}

Schedulerはcontrollerと同様に依存性の注入をサポートします:

```typescript
import { Scheduled, Daily, inject, Injectable } from '@zeltjs/core';

@Injectable() class EmailService { send(email: string, subject: string, body: string) { return Promise.resolve(); } }
@Injectable() class UserRepository { findWithPendingReminders() { return Promise.resolve([{ email: 'user@example.com' }]); } }
// ---cut---
@Scheduled()
class NotificationScheduler {
  constructor(
    private emailService = inject(EmailService),
    private userRepo = inject(UserRepository),
  ) {}

  @Daily({ hour: 8 })
  async sendReminders() {
    const users = await this.userRepo.findWithPendingReminders();
    for (const user of users) {
      await this.emailService.send(user.email, 'Reminder', '...');
    }
  }
}
```

## Node.jsエントリポイント {#nodejs-entry-point}

Node.jsアプリケーションでは、`createApp()` のfeature配列に `http()` と `scheduler()` を含め、`onNode()` の後で明示的にschedulerを開始します:

```typescript
import { onNode } from '@zeltjs/adapter-node';
import { createApp, Scheduled, Daily, http, scheduler } from '@zeltjs/core';

@Scheduled() class MyScheduler { @Daily({ hour: 9 }) async task() {} }
const app = createApp([http({ controllers: [] }), scheduler([MyScheduler])]);
// ---cut---
const nodeApp = await onNode(app);
const handle = await nodeApp.http.listen(3000);

// scheduled taskを開始する
await nodeApp.schedulers.startScheduler();

process.on('SIGTERM', async () => {
  await nodeApp.schedulers.stopScheduler();
  await handle.shutdown();
});
```

configurationを使う場合も、`scheduler([MyScheduler])` は `http()` と同じfeature配列に含め、`createRuntime()` 後に条件付きで開始します:

```typescript
import { createApp, Config, Env, inject, Scheduled, Daily, http, scheduler } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

@Config
class SchedulerConfig {
  static readonly Token = SchedulerConfig;
  constructor(private env = inject(Env)) {}
  get enabled() { return this.env.getBoolean('ENABLE_SCHEDULER', true); }
}

@Scheduled() class MyScheduler { @Daily({ hour: 9 }) async task() {} }

const app = createApp([http({ controllers: [] }), scheduler([MyScheduler])], { configs: [SchedulerConfig] });
const nodeApp = await onNode(app);
// ---cut---
const config = await nodeApp.get(SchedulerConfig);
if (config.enabled) {
  await nodeApp.schedulers.startScheduler();
}
```

## Cron式のフォーマット {#cron-expression-format}

Zeltは秒をオプションとする標準的なcron形式を使用します:

```
┌──────────── 秒(オプション、0-59)
│ ┌────────── 分(0-59)
│ │ ┌──────── 時(0-23)
│ │ │ ┌────── 日(1-31)
│ │ │ │ ┌──── 月(1-12)
│ │ │ │ │ ┌── 曜日(0-6、日曜日=0)
│ │ │ │ │ │
* * * * * *
```

よく使われるパターン:

| パターン | 説明 |
|---------|-------------|
| `* * * * *` | 毎分 |
| `0 * * * *` | 毎時 |
| `0 0 * * *` | 毎日深夜0時 |
| `0 9 * * 1` | 毎週月曜日9:00 |
| `*/15 * * * *` | 15分ごと |
| `0 0 1 * *` | 毎月1日 |
