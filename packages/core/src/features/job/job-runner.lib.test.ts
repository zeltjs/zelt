import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZeltLifecycleStateError } from '../../kernel';
import type { Job, JobDispatcher } from './job.types';
import { createJobRunner, JobRunnerReentrantShutdownError } from './job-runner.lib';

describe('JobRunner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs dispatchSync immediately and propagates errors', async () => {
    const runner = createJobRunner();
    const calls: string[] = [];

    await runner.dispatchSync({
      name: 'sync-job',
      handle() {
        calls.push('handled');
      },
    });

    expect(calls).toEqual(['handled']);
    await expect(
      runner.dispatchSync({
        name: 'failing-sync-job',
        handle() {
          throw new Error('sync failed');
        },
      }),
    ).rejects.toThrow('sync failed');
    expect(runner.getFailures()).toHaveLength(0);
  });

  it('exposes the public JobDispatcher API names', async () => {
    const runner = createJobRunner();
    const dispatcher: JobDispatcher = runner;
    const handled = vi.fn();

    expect(dispatcher.getJobStats()).toEqual(runner.getStats());
    expect(dispatcher.getJobFailures()).toEqual(runner.getFailures());
    await expect(dispatcher.dispatchAfterResponse({ handle: handled })).resolves.toBeUndefined();

    await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
  });

  it('dispatches jobs asynchronously without blocking the caller', async () => {
    const runner = createJobRunner();
    let releaseJob!: () => void;
    const completed = vi.fn();
    let markJobStarted!: () => void;
    const jobStarted = new Promise<void>((resolve) => {
      markJobStarted = resolve;
    });
    const dispatchPromise = runner.dispatch({
      name: 'async-job',
      async handle() {
        markJobStarted();
        await new Promise<void>((release) => {
          releaseJob = release;
        });
        completed();
      },
    });

    expect(completed).not.toHaveBeenCalled();
    expect(runner.getStats()).toMatchObject({ pending: 0, active: 1 });

    await jobStarted;
    await expect(dispatchPromise).resolves.toBeUndefined();
    expect(completed).not.toHaveBeenCalled();

    releaseJob();
    await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(runner.getStats()).toMatchObject({ pending: 0, active: 0 });
  });

  it('runs delayed dispatch only after the delay', async () => {
    vi.useFakeTimers();
    const runner = createJobRunner();
    const handled = vi.fn();

    await runner.dispatch({ handle: handled }, { delay: 100 });

    expect(handled).not.toHaveBeenCalled();
    expect(runner.getStats()).toMatchObject({ pending: 1, active: 0 });

    await vi.advanceTimersByTimeAsync(99);
    expect(handled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
    expect(runner.getStats()).toMatchObject({ pending: 0, active: 0 });
  });

  it('records async failures without throwing from dispatch', async () => {
    const runner = createJobRunner();
    const error = new Error('async failed');

    await expect(
      runner.dispatch({
        name: 'failing-async-job',
        async handle() {
          throw error;
        },
      }),
    ).resolves.toBeUndefined();

    await vi.waitFor(() => expect(runner.getFailures()).toHaveLength(1));
    expect(runner.getFailures()[0]).toMatchObject({
      jobName: 'failing-async-job',
      error,
    });
    expect(runner.getFailures()[0]?.failedAt).toBeInstanceOf(Date);
    expect(runner.getStats()).toMatchObject({ failed: 1 });
  });

  it('clears delayed jobs on shutdown and rejects new dispatches', async () => {
    vi.useFakeTimers();
    const runner = createJobRunner();
    const handled = vi.fn();

    await runner.dispatch({ name: 'delayed-job', handle: handled }, { delay: 100 });
    await runner.shutdown();
    await vi.advanceTimersByTimeAsync(100);

    expect(handled).not.toHaveBeenCalled();
    expect(runner.getStats()).toEqual({
      pending: 0,
      active: 0,
      failed: 0,
      shutdown: true,
    });
    await expect(runner.dispatch({ handle: vi.fn() })).rejects.toThrow(ZeltLifecycleStateError);
    await expect(runner.dispatchSync({ handle: vi.fn() })).rejects.toThrow(ZeltLifecycleStateError);
  });

  it('tracks dispatchSync as active and waits for it during shutdown', async () => {
    const runner = createJobRunner();
    let releaseJob!: () => void;
    let shutdownSettled = false;
    const syncJob = runner.dispatchSync({
      name: 'long-sync-job',
      async handle() {
        await new Promise<void>((release) => {
          releaseJob = release;
        });
      },
    });

    expect(runner.getStats()).toMatchObject({ active: 1 });

    const shutdownPromise = Promise.resolve(runner.shutdown()).then(() => {
      shutdownSettled = true;
    });

    await Promise.resolve();
    expect(shutdownSettled).toBe(false);

    releaseJob();
    await syncJob;
    await shutdownPromise;
    expect(runner.getStats()).toMatchObject({ active: 0, shutdown: true });
  });

  it('rejects shutdown called from inside an active job without hanging', async () => {
    const runner = createJobRunner();
    let markShutdownRejected!: () => void;
    const shutdownRejected = new Promise<void>((resolve) => {
      markShutdownRejected = resolve;
    });

    const syncJob = runner.dispatchSync({
      name: 'reentrant-sync-job',
      async handle() {
        await expect(runner.shutdown()).rejects.toThrow(JobRunnerReentrantShutdownError);
        markShutdownRejected();
      },
    });

    await shutdownRejected;
    expect(runner.getStats()).toMatchObject({ active: 1, shutdown: false });

    await syncJob;
    expect(runner.getStats()).toMatchObject({ active: 0, shutdown: false });
  });

  it('rejects shutdown called from an async continuation inside an active job', async () => {
    const runner = createJobRunner();
    let markShutdownRejected!: () => void;
    const shutdownRejected = new Promise<void>((resolve) => {
      markShutdownRejected = resolve;
    });

    const syncJob = runner.dispatchSync({
      name: 'async-continuation-reentrant-job',
      async handle() {
        await Promise.resolve();
        await expect(runner.shutdown()).rejects.toThrow(JobRunnerReentrantShutdownError);
        markShutdownRejected();
      },
    });

    await shutdownRejected;
    expect(runner.getStats()).toMatchObject({ active: 1, shutdown: false });

    await syncJob;
    expect(runner.getStats()).toMatchObject({ active: 0, shutdown: false });
  });

  it('waits for active jobs to settle during shutdown', async () => {
    const runner = createJobRunner();
    let releaseJob!: () => void;
    const job: Job = {
      name: 'active-job',
      async handle() {
        await new Promise<void>((release) => {
          releaseJob = release;
        });
      },
    };

    await runner.dispatch(job);
    expect(runner.getStats()).toMatchObject({ active: 1, shutdown: false });

    const shutdownPromise = runner.shutdown();
    expect(runner.getStats()).toMatchObject({ active: 1, shutdown: true });

    releaseJob();
    await shutdownPromise;
    expect(runner.getStats()).toMatchObject({ active: 0, shutdown: true });
  });

  it('returns defensive snapshots of recorded failures', async () => {
    const runner = createJobRunner();

    await runner.dispatch({
      name: 'snapshot-job',
      async handle() {
        throw new Error('snapshot failure');
      },
    });
    await vi.waitFor(() => expect(runner.getJobFailures()).toHaveLength(1));

    const firstSnapshot = runner.getJobFailures();
    const originalFailedAt = firstSnapshot[0]?.failedAt.getTime();
    (firstSnapshot as unknown as Job[]).length = 0;
    firstSnapshot[0]?.failedAt.setFullYear(2000);

    expect(runner.getStats()).toMatchObject({ failed: 1 });
    expect(runner.getJobFailures()).toHaveLength(1);
    expect(runner.getJobFailures()[0]?.failedAt.getTime()).toBe(originalFailedAt);
  });

  it.each([
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects invalid delay value %s', async (delay) => {
    const runner = createJobRunner();

    await expect(runner.dispatch({ handle: vi.fn() }, { delay })).rejects.toThrow(
      'Invalid job delay',
    );
    expect(runner.getStats()).toMatchObject({ pending: 0, active: 0 });
  });

  it('allows the maximum timer delay without running it immediately', async () => {
    vi.useFakeTimers();
    const runner = createJobRunner();
    const handled = vi.fn();

    await runner.dispatch({ handle: handled }, { delay: 2_147_483_647 });

    expect(runner.getStats()).toMatchObject({ pending: 1, active: 0 });
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects timer delays that exceed the setTimeout maximum', async () => {
    const runner = createJobRunner();

    await expect(runner.dispatch({ handle: vi.fn() }, { delay: 2_147_483_648 })).rejects.toThrow(
      'Invalid job delay',
    );
    expect(runner.getStats()).toMatchObject({ pending: 0, active: 0 });
  });
});
