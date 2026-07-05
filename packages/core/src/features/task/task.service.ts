import { LoggerService } from '../../built-in-service';
import { Injectable, inject, LifecycleManager } from '../../kernel';
import { registerAfterResponseCallback } from '../http/request';
import type { TaskFunction, TaskOptions } from './task.types';
import type { TaskRunner } from './task-runner.lib';
import { createTaskRunner } from './task-runner.lib';

@Injectable()
export class TaskService {
  private readonly runner: TaskRunner;

  constructor(
    lifecycleManager: LifecycleManager = inject(LifecycleManager),
    logger: LoggerService = inject(LoggerService),
  ) {
    this.runner = createTaskRunner((taskName, error) => {
      logger.error('Background task failed', { taskName, error });
    });
    lifecycleManager.register(this.runner);
  }

  /** @throws {ZeltLifecycleStateError} */
  run(task: TaskFunction, options?: TaskOptions): void {
    this.runner.run(task, options);
  }

  /** @throws {ZeltLifecycleStateError | unknown} from task() */
  runAndWait(task: TaskFunction): Promise<void> {
    return this.runner.runAndWait(task);
  }

  // ZeltContextNotAvailableError is declared per the throw-trace convention because it
  // statically propagates from registerAfterResponseCallback, but it is unreachable here:
  // registerAfterResponseCallback checks hasContext() before touching context internals.
  /** @throws {ZeltLifecycleStateError | ZeltContextNotAvailableError} */
  afterResponse(task: TaskFunction, options?: TaskOptions): void {
    const registered = registerAfterResponseCallback(() => this.runner.run(task, options));
    if (!registered) this.runner.run(task, options);
  }
}
