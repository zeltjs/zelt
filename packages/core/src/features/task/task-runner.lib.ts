import { AsyncLocalStorage } from 'node:async_hooks';
import type { Lifecycle } from '../../kernel';
import { ZeltLifecycleStateError } from '../../kernel';
import type { TaskFailureHandler, TaskFunction, TaskOptions } from './task.types';

export class TaskRunnerReentrantShutdownError extends Error {
  constructor() {
    super('Cannot shut down task runner from inside an active task');
    this.name = 'TaskRunnerReentrantShutdownError';
  }
}

export type TaskRunner = Omit<Lifecycle, 'shutdown'> & {
  // Narrowed from Lifecycle's `Promise<void> | void`: this implementation's
  // shutdown() is always async, and callers chain on the returned promise.
  shutdown(): Promise<void>;
  run(task: TaskFunction, options?: TaskOptions): void;
  runAndWait(task: TaskFunction): Promise<void>;
};

const ANONYMOUS_TASK_NAME = '<anonymous>';
const TASK_EXECUTION_CONTEXT = Symbol('taskExecutionContext');
type TaskExecutionContext = typeof TASK_EXECUTION_CONTEXT;

type TaskRunnerState = {
  readonly taskExecutionContext: AsyncLocalStorage<TaskExecutionContext>;
  readonly activeTasks: Set<Promise<void>>;
  shutdownRequested: boolean;
};

/** @throws {ZeltLifecycleStateError} */
const assertRunning = (state: TaskRunnerState, operation: 'run' | 'runAndWait'): void => {
  if (state.shutdownRequested) {
    throw new ZeltLifecycleStateError({ operation, currentState: 'disposed' });
  }
};

/** @throws {TaskRunnerReentrantShutdownError} */
const assertNotInsideTask = (state: TaskRunnerState): void => {
  if (state.taskExecutionContext.getStore() === TASK_EXECUTION_CONTEXT) {
    throw new TaskRunnerReentrantShutdownError();
  }
};

/** @throws {unknown} from task() */
const runInTaskContext = (state: TaskRunnerState, task: TaskFunction): Promise<void> | void =>
  state.taskExecutionContext.run(TASK_EXECUTION_CONTEXT, () => task());

export const createTaskRunner = (onFailure: TaskFailureHandler): TaskRunner => {
  const state: TaskRunnerState = {
    taskExecutionContext: new AsyncLocalStorage<TaskExecutionContext>(),
    activeTasks: new Set<Promise<void>>(),
    shutdownRequested: false,
  };

  const startup = (): void => {};

  /** @throws {ZeltLifecycleStateError} */
  const run = (task: TaskFunction, options: TaskOptions = {}): void => {
    assertRunning(state, 'run');
    let activeTask: Promise<void>;
    activeTask = Promise.resolve()
      .then(() => runInTaskContext(state, task))
      .catch((error: unknown) => {
        try {
          onFailure(options.name ?? ANONYMOUS_TASK_NAME, error);
        } catch {
          // A throwing failure handler must not reject the background chain:
          // nothing observes activeTask, so it would surface as an unhandledRejection
          // (same guard as after-response.lib.ts's onError handling).
        }
      })
      .finally(() => state.activeTasks.delete(activeTask));
    state.activeTasks.add(activeTask);
  };

  /** @throws {ZeltLifecycleStateError | unknown} from task() */
  const runAndWait = async (task: TaskFunction): Promise<void> => {
    assertRunning(state, 'runAndWait');
    let activeTask: Promise<void>;
    activeTask = Promise.resolve()
      .then(() => runInTaskContext(state, task))
      .finally(() => {
        state.activeTasks.delete(activeTask);
      });
    state.activeTasks.add(activeTask);
    await activeTask;
  };

  /** @throws {TaskRunnerReentrantShutdownError} */
  const shutdown = async (): Promise<void> => {
    assertNotInsideTask(state);
    state.shutdownRequested = true;
    await Promise.allSettled(state.activeTasks);
  };

  return { startup, shutdown, run, runAndWait };
};
