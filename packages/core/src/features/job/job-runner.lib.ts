import { AsyncLocalStorage } from 'node:async_hooks';
import type { Lifecycle } from '../../kernel';
import { ZeltLifecycleStateError } from '../../kernel';
import type { Job, JobDispatcher, JobDispatchOptions, JobFailure, JobStats } from './job.types';

export class JobRunnerInvalidDelayError extends Error {
  constructor(delay: number) {
    super(`Invalid job delay: ${String(delay)}`);
    this.name = 'JobRunnerInvalidDelayError';
  }
}

export class JobRunnerReentrantShutdownError extends Error {
  constructor() {
    super('Cannot shut down job runner from inside an active job');
    this.name = 'JobRunnerReentrantShutdownError';
  }
}

export type JobRunner = Lifecycle &
  JobDispatcher & {
    dispatch(job: Job, options?: JobDispatchOptions): Promise<void>;
    dispatchSync(job: Job): Promise<void>;
    dispatchAfterResponse(job: Job): Promise<void>;
    getFailures(): readonly JobFailure[];
    getStats(): JobStats;
  };

const ANONYMOUS_JOB_NAME = '<anonymous>';
const MAX_TIMER_DELAY = 2_147_483_647;
const JOB_EXECUTION_CONTEXT = Symbol('jobExecutionContext');
type JobExecutionContext = typeof JOB_EXECUTION_CONTEXT;
type JobRunnerState = {
  readonly jobExecutionContext: AsyncLocalStorage<JobExecutionContext>;
  readonly pendingTimers: Set<ReturnType<typeof setTimeout>>;
  readonly activeJobs: Set<Promise<void>>;
  readonly failures: JobFailure[];
  shutdownRequested: boolean;
};

const copyFailures = (failures: readonly JobFailure[]): readonly JobFailure[] =>
  failures.map((failure) => ({
    ...failure,
    failedAt: new Date(failure.failedAt),
  }));

/** @throws {JobRunnerInvalidDelayError} */
const validateDelay = (delay: number | undefined): number => {
  const normalizedDelay = delay ?? 0;
  if (
    !Number.isFinite(normalizedDelay) ||
    normalizedDelay < 0 ||
    normalizedDelay > MAX_TIMER_DELAY
  ) {
    throw new JobRunnerInvalidDelayError(normalizedDelay);
  }
  return normalizedDelay;
};

/** @throws {ZeltLifecycleStateError} */
const assertRunning = (state: JobRunnerState): void => {
  if (state.shutdownRequested) {
    throw new ZeltLifecycleStateError({ operation: 'dispatch', currentState: 'disposed' });
  }
};

/** @throws {JobRunnerReentrantShutdownError} */
const assertNotRunningJobHandle = (state: JobRunnerState): void => {
  if (state.jobExecutionContext.getStore() === JOB_EXECUTION_CONTEXT) {
    throw new JobRunnerReentrantShutdownError();
  }
};

const recordFailure = (state: JobRunnerState, job: Job, error: unknown): void => {
  state.failures.push({
    jobName: job.name ?? ANONYMOUS_JOB_NAME,
    error,
    failedAt: new Date(),
  });
};

const clearPendingTimers = (state: JobRunnerState): void => {
  for (const timer of state.pendingTimers) {
    clearTimeout(timer);
  }
  state.pendingTimers.clear();
};

/** @throws {unknown} from job.handle */
const runJobHandle = (state: JobRunnerState, job: Job): Promise<void> | void =>
  state.jobExecutionContext.run(JOB_EXECUTION_CONTEXT, () => job.handle());

const runAsyncJob = (state: JobRunnerState, job: Job): void => {
  let activeJob: Promise<void>;
  activeJob = Promise.resolve()
    .then(() => runJobHandle(state, job))
    .catch((error: unknown) => recordFailure(state, job, error))
    .finally(() => state.activeJobs.delete(activeJob));

  state.activeJobs.add(activeJob);
};

const dispatchWithDelay = (state: JobRunnerState, job: Job, delay: number): void => {
  const timer = setTimeout(() => {
    state.pendingTimers.delete(timer);
    runAsyncJob(state, job);
  }, delay);
  state.pendingTimers.add(timer);
};

/** @throws {unknown} from job.handle */
const createSyncJob = (state: JobRunnerState, job: Job): Promise<void> => {
  let activeJob: Promise<void>;
  activeJob = Promise.resolve()
    .then(() => runJobHandle(state, job))
    .finally(() => {
      state.activeJobs.delete(activeJob);
    });
  return activeJob;
};

const createInitialState = (): JobRunnerState => ({
  jobExecutionContext: new AsyncLocalStorage<JobExecutionContext>(),
  pendingTimers: new Set<ReturnType<typeof setTimeout>>(),
  activeJobs: new Set<Promise<void>>(),
  failures: [],
  shutdownRequested: false,
});

export const createJobRunner = (): JobRunner => {
  const state = createInitialState();
  const startup = (): void => {};

  /** @throws {ZeltLifecycleStateError | JobRunnerInvalidDelayError} */
  const dispatch = async (job: Job, options: JobDispatchOptions = {}): Promise<void> => {
    assertRunning(state);
    const delay = validateDelay(options.delay);
    if (delay > 0) {
      dispatchWithDelay(state, job, delay);
      return;
    }

    runAsyncJob(state, job);
  };

  /** @throws {ZeltLifecycleStateError | unknown} from job.handle */
  const dispatchSync = async (job: Job): Promise<void> => {
    assertRunning(state);
    const activeJob = createSyncJob(state, job);
    state.activeJobs.add(activeJob);
    await activeJob;
  };

  /** @throws {ZeltLifecycleStateError} */
  const dispatchAfterResponse = (job: Job): Promise<void> => {
    assertRunning(state);
    runAsyncJob(state, job);
    return Promise.resolve();
  };

  /** @throws {JobRunnerReentrantShutdownError} */
  const shutdown = async (): Promise<void> => {
    assertNotRunningJobHandle(state);
    state.shutdownRequested = true;
    clearPendingTimers(state);

    await Promise.allSettled(state.activeJobs);
  };

  const getJobFailures = (): readonly JobFailure[] => copyFailures(state.failures);

  const getFailures = (): readonly JobFailure[] => getJobFailures();

  const getJobStats = (): JobStats => ({
    pending: state.pendingTimers.size,
    active: state.activeJobs.size,
    failed: state.failures.length,
    shutdown: state.shutdownRequested,
  });

  const getStats = (): JobStats => getJobStats();

  return {
    startup,
    shutdown,
    dispatch,
    dispatchSync,
    dispatchAfterResponse,
    getFailures,
    getJobFailures,
    getStats,
    getJobStats,
  };
};
