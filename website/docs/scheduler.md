---
sidebar_position: 7
---

# Scheduler

Zelt provides declarative scheduling decorators for running tasks at specified intervals or cron expressions.

## Overview

The scheduler API consists of:

- **`@Scheduled`** — Class decorator marking a class as a scheduler
- **`@Cron(expression)`** — Run at specific cron expression
- **`@Daily({ hour, minute? })`** — Run once per day
- **`@Hourly({ minute? })`** — Run once per hour
- **`@Weekly({ day, hour, minute? })`** — Run once per week
- **`@Every({ minutes | seconds })`** — Run at fixed intervals

## Basic Usage

### Creating a Scheduler

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

### Registering Schedulers

Pass scheduler classes to `createHttpApp()`:

```typescript
import { createHttpApp } from '@zeltjs/core';

const app = createHttpApp({
  controllers: [UserController],
  schedulers: [ReportScheduler],
});
```

### Starting the Scheduler

Call `startScheduler()` to begin executing scheduled tasks:

```typescript
app.startScheduler();
```

To stop the scheduler gracefully:

```typescript
await app.stopScheduler();
```

## Decorator Reference

### @Cron

Run at specific cron expression:

```typescript
@Scheduled()
class BackupScheduler {
  @Cron('0 2 * * *')
  async runBackup() {
    // Runs at 2:00 AM every day
  }

  @Cron('*/5 * * * *')
  async quickCheck() {
    // Runs every 5 minutes
  }
}
```

With timezone:

```typescript
@Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
async morningTask() {
  // Runs at 9:00 AM JST
}
```

### @Daily

Run once per day at specified hour:

```typescript
@Scheduled()
class DailyTasks {
  @Daily({ hour: 6 })
  async earlyMorning() {
    // Runs at 6:00 AM
  }

  @Daily({ hour: 23, minute: 30 })
  async lateNight() {
    // Runs at 11:30 PM
  }

  @Daily({ hour: 9, tz: 'America/New_York' })
  async newYorkMorning() {
    // Runs at 9:00 AM EST/EDT
  }
}
```

### @Hourly

Run once per hour:

```typescript
@Scheduled()
class HourlyTasks {
  @Hourly()
  async everyHour() {
    // Runs at minute 0 of every hour
  }

  @Hourly({ minute: 30 })
  async halfPast() {
    // Runs at minute 30 of every hour
  }
}
```

### @Weekly

Run once per week:

```typescript
@Scheduled()
class WeeklyTasks {
  @Weekly({ day: 'monday', hour: 9 })
  async mondayMeeting() {
    // Runs every Monday at 9:00 AM
  }

  @Weekly({ day: 'friday', hour: 17, minute: 30 })
  async weeklyReport() {
    // Runs every Friday at 5:30 PM
  }
}
```

Available days: `'sunday'`, `'monday'`, `'tuesday'`, `'wednesday'`, `'thursday'`, `'friday'`, `'saturday'`

### @Every

Run at fixed intervals:

```typescript
@Scheduled()
class PollingTasks {
  @Every({ minutes: 5 })
  async pollApi() {
    // Runs every 5 minutes
  }

  @Every({ seconds: 30 })
  async frequentCheck() {
    // Runs every 30 seconds
  }
}
```

## Dependency Injection

Schedulers support dependency injection like controllers:

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

## Node.js Entry Point

For Node.js applications, start the scheduler in your entry point:

```typescript
import { listen } from '@zeltjs/adapter-node';
import { app } from './app';

listen(app, { port: 3000 });
app.startScheduler();

process.on('SIGTERM', async () => {
  await app.stopScheduler();
  process.exit(0);
});
```

## Cron Expression Format

Zelt uses standard cron format with optional seconds:

```
┌──────────── second (optional, 0-59)
│ ┌────────── minute (0-59)
│ │ ┌──────── hour (0-23)
│ │ │ ┌────── day of month (1-31)
│ │ │ │ ┌──── month (1-12)
│ │ │ │ │ ┌── day of week (0-6, Sunday=0)
│ │ │ │ │ │
* * * * * *
```

Common patterns:

| Pattern | Description |
|---------|-------------|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Every day at midnight |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 1 * *` | First day of every month |
