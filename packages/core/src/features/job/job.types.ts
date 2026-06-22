export type Awaitable<T> = T | Promise<T>;

export interface Job {
  readonly name?: string;
  handle(): Awaitable<void>;
}

export interface JobDispatchOptions {
  readonly delay?: number;
}

export interface JobFailure {
  readonly jobName: string;
  readonly error: unknown;
  readonly failedAt: Date;
}

export interface JobStats {
  readonly pending: number;
  readonly active: number;
  readonly failed: number;
  readonly shutdown: boolean;
}

export interface JobDispatcher {
  dispatch(job: Job, options?: JobDispatchOptions): Promise<void>;
  dispatchSync(job: Job): Promise<void>;
  dispatchAfterResponse(job: Job): Promise<void>;
  getJobStats(): JobStats;
  getJobFailures(): readonly JobFailure[];
}
