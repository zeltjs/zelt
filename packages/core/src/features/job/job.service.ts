import { Injectable, inject, LifecycleManager } from '../../kernel';
import { registerAfterResponseCallback } from '../http/request';
import type { Job, JobDispatchOptions, JobFailure, JobStats } from './job.types';
import type { JobRunner } from './job-runner.lib';
import { createJobRunner } from './job-runner.lib';

@Injectable()
export class JobService {
  private readonly runner: JobRunner;

  constructor(lifecycleManager: LifecycleManager = inject(LifecycleManager)) {
    this.runner = createJobRunner();
    lifecycleManager.register(this.runner);
  }

  dispatch(job: Job, options?: JobDispatchOptions): Promise<void> {
    return this.runner.dispatch(job, options);
  }

  dispatchSync(job: Job): Promise<void> {
    return this.runner.dispatchSync(job);
  }

  /** @throws {ZeltContextNotAvailableError} */
  dispatchAfterResponse(job: Job): Promise<void> {
    const registered = registerAfterResponseCallback(() => this.runner.dispatch(job));
    if (registered) return Promise.resolve();
    return this.runner.dispatch(job);
  }

  getJobStats(): JobStats {
    return this.runner.getJobStats();
  }

  getJobFailures(): readonly JobFailure[] {
    return this.runner.getJobFailures();
  }
}
