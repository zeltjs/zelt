---
sidebar_position: 7
---

# スケジューラー

Zeltは指定した間隔またはcron式でタスクを実行するための宣言的スケジューリングデコレータを提供します。

## 概要

スケジューラーAPIは以下で構成されます：

- **`@Scheduled`** — クラスをスケジューラーとしてマークするクラスデコレータ
- **`@Cron(expression)`** — 特定のcron式で実行
- **`@Daily({ hour, minute? })`** — 1日1回実行
- **`@Hourly({ minute? })`** — 1時間1回実行
- **`@Weekly({ day, hour, minute? })`** — 週1回実行
- **`@Every({ minutes | seconds })`** — 固定間隔で実行

## 基本的な使い方

### スケジューラーの作成

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

### スケジューラーの登録

`createApp()`にスケジューラークラスを渡します：

```typescript
import { createApp } from '@zeltjs/core';

const app = createApp({
  http: { controllers: [UserController] },
  schedulers: [ReportScheduler],
});
```

### スケジューラーの開始

スケジューラーは明示的に起動する必要があります。`onNode()`と`ready()`を呼び出した後、`startScheduler()`を呼び出してスケジュールされたタスクの実行を開始します：

```typescript
await nodeApp.startScheduler();
```

スケジューラーを正常に停止するには：

```typescript
await nodeApp.stopScheduler();
```

スケジューラーはアプリがreadyになっても**自動的には開始されません**。この設計により以下が可能になります：

- スケジュールタスクなしでHTTPサーバーを実行（例：テスト時）
- サーバーとは独立してスケジューラーのライフサイクルを制御
- 環境に基づいてスケジューリングを条件付きで有効化

## デコレータリファレンス

### @Cron

特定のcron式で実行：

```typescript
@Scheduled()
class BackupScheduler {
  @Cron('0 2 * * *')
  async runBackup() {
    // 毎日午前2時に実行
  }

  @Cron('*/5 * * * *')
  async quickCheck() {
    // 5分ごとに実行
  }
}
```

タイムゾーン指定：

```typescript
@Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
async morningTask() {
  // 日本時間午前9時に実行
}
```

### @Daily

指定した時間に1日1回実行：

```typescript
@Scheduled()
class DailyTasks {
  @Daily({ hour: 6 })
  async earlyMorning() {
    // 午前6時に実行
  }

  @Daily({ hour: 23, minute: 30 })
  async lateNight() {
    // 午後11時30分に実行
  }

  @Daily({ hour: 9, tz: 'America/New_York' })
  async newYorkMorning() {
    // EST/EDT午前9時に実行
  }
}
```

### @Hourly

1時間に1回実行：

```typescript
@Scheduled()
class HourlyTasks {
  @Hourly()
  async everyHour() {
    // 毎時0分に実行
  }

  @Hourly({ minute: 30 })
  async halfPast() {
    // 毎時30分に実行
  }
}
```

### @Weekly

週1回実行：

```typescript
@Scheduled()
class WeeklyTasks {
  @Weekly({ day: 'monday', hour: 9 })
  async mondayMeeting() {
    // 毎週月曜日午前9時に実行
  }

  @Weekly({ day: 'friday', hour: 17, minute: 30 })
  async weeklyReport() {
    // 毎週金曜日午後5時30分に実行
  }
}
```

使用可能な曜日: `'sunday'`, `'monday'`, `'tuesday'`, `'wednesday'`, `'thursday'`, `'friday'`, `'saturday'`

### @Every

固定間隔で実行：

```typescript
@Scheduled()
class PollingTasks {
  @Every({ minutes: 5 })
  async pollApi() {
    // 5分ごとに実行
  }

  @Every({ seconds: 30 })
  async frequentCheck() {
    // 30秒ごとに実行
  }
}
```

## 依存性注入

スケジューラーはコントローラーと同様に依存性注入をサポート：

```typescript
import { Scheduled, Daily, inject } from '@zeltjs/core';

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

## Node.jsエントリーポイント

Node.jsアプリケーションでは、`onNode()`を使用して明示的にスケジューラーを開始します：

```typescript
import { onNode } from '@zeltjs/adapter-node';
import { app } from './app';

const nodeApp = await onNode(app);
const handle = await nodeApp.listen(3000);

// スケジュールタスクを開始
await nodeApp.startScheduler();

process.on('SIGTERM', async () => {
  await nodeApp.stopScheduler();
  await handle.shutdown();
});
```

スケジューラーを条件付きで有効化できます：

```typescript
if (process.env.ENABLE_SCHEDULER !== 'false') {
  await nodeApp.startScheduler();
}
```

## Cron式フォーマット

Zeltはオプションの秒を含む標準cron形式を使用：

```
┌──────────── 秒（オプション、0-59）
│ ┌────────── 分（0-59）
│ │ ┌──────── 時（0-23）
│ │ │ ┌────── 日（1-31）
│ │ │ │ ┌──── 月（1-12）
│ │ │ │ │ ┌── 曜日（0-6、日曜日=0）
│ │ │ │ │ │
* * * * * *
```

一般的なパターン：

| パターン | 説明 |
|---------|-------------|
| `* * * * *` | 毎分 |
| `0 * * * *` | 毎時 |
| `0 0 * * *` | 毎日深夜 |
| `0 9 * * 1` | 毎週月曜日午前9時 |
| `*/15 * * * *` | 15分ごと |
| `0 0 1 * *` | 毎月1日 |
