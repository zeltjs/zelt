import { Injectable, inject, ZeltLifecycleStateError } from '../kernel';
import { AppBootstrap } from './app-bootstrap.lib';
import type { RegisterRuntimeShutdown } from './feature.types';
import { FeatureRegistryService } from './feature-registry.service';
import type { RuntimeShutdownData } from './runtime-shutdown.lib';
import {
  createRuntimeShutdownData,
  registerShutdownCallback,
  runShutdownCallbacks,
} from './runtime-shutdown.lib';

@Injectable()
export class RuntimeShutdownService {
  constructor(
    private readonly runtime: AppBootstrap = inject(AppBootstrap),
    private readonly featureRegistry: FeatureRegistryService = inject(FeatureRegistryService),
    private readonly shutdownState: RuntimeShutdownData = createRuntimeShutdownData(),
  ) {}

  get state(): 'ready' | 'shuttingDown' | 'disposed' {
    if (this.runtime.isDisposed) return 'disposed';
    return this.shutdownState.promise === undefined ? 'ready' : 'shuttingDown';
  }

  /** @throws {ZeltLifecycleStateError} */
  readonly registerShutdown: RegisterRuntimeShutdown = (callback, options) => {
    if (this.state !== 'ready') {
      throw new ZeltLifecycleStateError({
        operation: 'register shutdown callback',
        currentState: 'disposed',
      });
    }
    return registerShutdownCallback(
      options?.phase === 'after' ? this.shutdownState.after : this.shutdownState.before,
      callback,
    );
  };

  /** @throws {AggregateError | ZeltLifecycleStateError | Error} */
  readonly shutdown = (): Promise<void> => {
    this.shutdownState.promise ??= Promise.resolve()
      .then(() => this.runShutdown())
      .finally(() => {
        if (this.runtime.isDisposed) this.featureRegistry.dispose();
        else this.shutdownState.promise = undefined;
      });
    return this.shutdownState.promise;
  };

  /** @throws {AggregateError | ZeltLifecycleStateError | Error} */
  private async runShutdown(): Promise<void> {
    this.runtime.assertCanShutdown();
    const errors: unknown[] = [];
    try {
      await runShutdownCallbacks(this.shutdownState.before);
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.runtime.shutdown();
    } catch (error) {
      errors.push(error);
    }
    if (this.runtime.isDisposed) {
      try {
        await runShutdownCallbacks(this.shutdownState.after);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Runtime shutdown encountered errors');
    }
  }
}
