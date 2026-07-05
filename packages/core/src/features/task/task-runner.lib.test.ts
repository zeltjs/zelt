import { describe, expect, it, vi } from 'vitest';
import { ZeltLifecycleStateError } from '../../kernel';
import { createTaskRunner, TaskRunnerReentrantShutdownError } from './task-runner.lib';

describe('createTaskRunner', () => {
  it('run() executes the task asynchronously', async () => {
    const runner = createTaskRunner(() => {});
    const task = vi.fn();

    runner.run(task);

    expect(task).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
    await runner.shutdown();
  });

  it('run() reports failures to onFailure with the task name', async () => {
    const onFailure = vi.fn();
    const runner = createTaskRunner(onFailure);
    const error = new Error('task failed');

    runner.run(
      () => {
        throw error;
      },
      { name: 'failing-task' },
    );

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith('failing-task', error));
    await runner.shutdown();
  });

  it('run() reports failures as <anonymous> when the task has no name', async () => {
    const onFailure = vi.fn();
    const runner = createTaskRunner(onFailure);
    const error = new Error('anonymous failure');

    runner.run(() => {
      throw error;
    });

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith('<anonymous>', error));
    await runner.shutdown();
  });

  it('runAndWait() resolves after the task completes', async () => {
    const runner = createTaskRunner(() => {});
    const events: string[] = [];

    await runner.runAndWait(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push('task-done');
    });

    expect(events).toEqual(['task-done']);
    await runner.shutdown();
  });

  it('runAndWait() propagates task errors to the caller without calling onFailure', async () => {
    const onFailure = vi.fn();
    const runner = createTaskRunner(onFailure);

    await expect(
      runner.runAndWait(() => {
        throw new Error('sync failure');
      }),
    ).rejects.toThrow('sync failure');

    expect(onFailure).not.toHaveBeenCalled();
    await runner.shutdown();
  });

  it('run() throws ZeltLifecycleStateError after shutdown', async () => {
    const runner = createTaskRunner(() => {});
    await runner.shutdown();

    expect(() => runner.run(() => {})).toThrow(ZeltLifecycleStateError);
  });

  it('runAndWait() rejects with ZeltLifecycleStateError after shutdown', async () => {
    const runner = createTaskRunner(() => {});
    await runner.shutdown();

    await expect(runner.runAndWait(() => {})).rejects.toThrow(ZeltLifecycleStateError);
    // Guards against the operation label regressing to the shared 'run' default.
    await expect(runner.runAndWait(() => {})).rejects.toThrow(/runAndWait/);
  });

  it('shutdown() waits for active tasks to settle', async () => {
    const runner = createTaskRunner(() => {});
    let finishTask!: () => void;
    const gate = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    const events: string[] = [];

    runner.run(async () => {
      await gate;
      events.push('task-finished');
    });

    const shutdownPromise = runner.shutdown().then(() => events.push('shutdown-finished'));
    finishTask();
    await shutdownPromise;

    expect(events).toEqual(['task-finished', 'shutdown-finished']);
  });

  it('shutdown() from inside an active task throws TaskRunnerReentrantShutdownError', async () => {
    const runner = createTaskRunner(() => {});
    let captured: unknown;

    await runner.runAndWait(async () => {
      try {
        await runner.shutdown();
      } catch (error) {
        captured = error;
      }
    });

    expect(captured).toBeInstanceOf(TaskRunnerReentrantShutdownError);
    await runner.shutdown();
  });

  it('run() does not emit an unhandled rejection when onFailure throws', async () => {
    const runner = createTaskRunner(() => {
      throw new Error('handler failure');
    });
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      runner.run(() => {
        throw new Error('task failure');
      });
      await runner.shutdown();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
