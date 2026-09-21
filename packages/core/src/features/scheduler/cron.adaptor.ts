import { Cron } from 'croner';
import { Config } from '../../built-in-service';

export type CronJobOptions = { readonly timezone?: string };

export type CronJobHandle = { readonly stop: () => void };

// Keeps the wall-clock cron timer behind a DI boundary so tests can swap in a
// fake that fires handlers on demand instead of waiting for real time.
@Config
export class CronAdaptor {
  schedule(expression: string, options: CronJobOptions, handler: () => void): CronJobHandle {
    const job = new Cron(expression, options, handler);
    return { stop: () => job.stop() };
  }
}
