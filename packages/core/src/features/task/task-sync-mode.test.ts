import { describe, expect, it } from 'vitest';
import { createTaskRunner, TaskRunnerSynchronousShutdownError } from './task-runner.lib';

describe('TaskRunner in synchronous context mode', () => {
  it('runs asynchronous tasks and shuts down once awaited tasks have finished', async () => {
    const runner = createTaskRunner({ contextMode: 'sync', onFailure: () => {} });
    let finished = false;
    await runner.runAndWait(async () => {
      await Promise.resolve();
      finished = true;
    });
    expect(finished).toBe(true);
    await expect(runner.shutdown()).resolves.toBeUndefined();
  });

  it('rejects ambiguous active-task draining without marking the runner disposed', async () => {
    const runner = createTaskRunner({ contextMode: 'sync', onFailure: () => {} });
    let finishTask: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    const completion = runner.runAndWait(() => gate);
    await expect(runner.shutdown()).rejects.toBeInstanceOf(TaskRunnerSynchronousShutdownError);
    finishTask();
    await completion;
    await runner.runAndWait(() => {});
    await runner.shutdown();
  });

  it('rejects shutdown from a suspended task instead of waiting on itself', async () => {
    const runner = createTaskRunner({ contextMode: 'sync', onFailure: () => {} });
    await runner.runAndWait(async () => {
      await Promise.resolve();
      await expect(runner.shutdown()).rejects.toBeInstanceOf(TaskRunnerSynchronousShutdownError);
    });
    await runner.shutdown();
  });
});
