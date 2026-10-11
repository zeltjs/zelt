import type { CapturedContext, ContextMode, ContextStorage, Lifecycle } from '../../kernel';
import { ContextRuntimeService, createContextStorage, ZeltLifecycleStateError } from '../../kernel';
import type { TaskFailureHandler, TaskFunction, TaskOptions } from './task.types';

export class TaskRunnerReentrantShutdownError extends Error {
  constructor() {
    super('Cannot shut down task runner from inside an active task');
    this.name = 'TaskRunnerReentrantShutdownError';
  }
}

export class TaskRunnerSynchronousShutdownError extends Error {
  constructor() {
    super(
      'Cannot wait for active tasks in sync context mode; await runAndWait() before shutdown(), or enable async context',
    );
    this.name = 'TaskRunnerSynchronousShutdownError';
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
  readonly taskExecutionContext: ContextStorage<TaskExecutionContext>;
  readonly contextRuntime: ContextRuntimeService;
  readonly activeTasks: Set<Promise<void>>;
  shutdownRequested: boolean;
};

/** @throws {ZeltLifecycleStateError} */
const assertRunning = (state: TaskRunnerState, operation: 'run' | 'runAndWait'): void => {
  if (state.shutdownRequested) {
    throw new ZeltLifecycleStateError({ operation, currentState: 'disposed' });
  }
};

/** @throws {TaskRunnerReentrantShutdownError | TaskRunnerSynchronousShutdownError} */
const assertNotInsideTask = (state: TaskRunnerState): void => {
  if (state.taskExecutionContext.get() === TASK_EXECUTION_CONTEXT) {
    throw new TaskRunnerReentrantShutdownError();
  }
  if (state.contextRuntime.mode === 'sync' && state.activeTasks.size > 0) {
    throw new TaskRunnerSynchronousShutdownError();
  }
};

/** @throws {unknown} from task() */
const runInTaskContext = (
  state: TaskRunnerState,
  scope: CapturedContext,
  task: TaskFunction,
): Promise<void> | void =>
  scope.run(() => state.taskExecutionContext.run(TASK_EXECUTION_CONTEXT, task));

export type CreateTaskRunnerOptions = {
  readonly contextMode?: ContextMode;
  readonly onFailure: TaskFailureHandler;
  // Lets the platform tie a fire-and-forget task to the runtime's
  // post-response lifetime (e.g. Cloudflare's ExecutionContext.waitUntil).
  readonly extend?: (task: Promise<void>) => void;
};

/** @throws {ZeltContextNotAvailableError | TypeError} */
export const createTaskRunner = (options: CreateTaskRunnerOptions): TaskRunner => {
  const { onFailure, extend } = options;
  const state: TaskRunnerState = {
    taskExecutionContext: createContextStorage<TaskExecutionContext>('zelt:task'),
    contextRuntime: new ContextRuntimeService(options.contextMode),
    activeTasks: new Set<Promise<void>>(),
    shutdownRequested: false,
  };

  const startup = (): void => {};

  /** @throws {ZeltLifecycleStateError | TypeError} */
  const run = (task: TaskFunction, taskOptions: TaskOptions = {}): void => {
    assertRunning(state, 'run');
    const scope = state.contextRuntime.createScope();
    let activeTask: Promise<void>;
    activeTask = Promise.resolve()
      .then(() => runInTaskContext(state, scope, task))
      .catch((error: unknown) => {
        try {
          onFailure(taskOptions.name ?? ANONYMOUS_TASK_NAME, error);
        } catch {
          // A throwing failure handler must not reject the background chain:
          // nothing observes activeTask, so it would surface as an unhandledRejection
          // (same guard as after-response.lib.ts's onError handling).
        }
      })
      .finally(() => state.activeTasks.delete(activeTask));
    state.activeTasks.add(activeTask);

    if (extend) {
      try {
        extend(activeTask);
      } catch (error) {
        // Extension failure means the platform may kill this task after the
        // response — report it against the task instead of crashing run().
        onFailure(taskOptions.name ?? ANONYMOUS_TASK_NAME, error);
      }
    }
  };

  /** @throws {ZeltLifecycleStateError | unknown} from task() */
  const runAndWait = async (task: TaskFunction): Promise<void> => {
    assertRunning(state, 'runAndWait');
    const scope = state.contextRuntime.createScope();
    let activeTask: Promise<void>;
    activeTask = Promise.resolve()
      .then(() => runInTaskContext(state, scope, task))
      .finally(() => {
        state.activeTasks.delete(activeTask);
      });
    state.activeTasks.add(activeTask);
    await activeTask;
  };

  /** @throws {TaskRunnerReentrantShutdownError | TaskRunnerSynchronousShutdownError} */
  const shutdown = async (): Promise<void> => {
    assertNotInsideTask(state);
    state.shutdownRequested = true;
    await Promise.allSettled(state.activeTasks);
  };

  return { startup, shutdown, run, runAndWait };
};
