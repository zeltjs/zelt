import { Injectable } from './di/index';
import { ZeltLifecycleStateError, ZeltReadyFailedError } from './errors';
import type { ReadyValue } from './internal';
import { createReadyValue, disposeReadyValue, sealReadyValue } from './internal';

export interface Lifecycle<TReady = void> {
  /** @throws {Error} */
  startup(): Promise<TReady> | TReady;
  shutdown(): Promise<void> | void;
}

type LifecycleEntry = {
  lc: Lifecycle<unknown>;
  readyValue?: ReadyValue<object>;
};

@Injectable()
export class LifecycleManager {
  private readonly lifecycles: LifecycleEntry[] = [];
  private startedIndex = 0;
  private disposed = false;
  private shutdownPromise: Promise<void> | undefined;

  register(lifecycle: Lifecycle<void>): void;
  register<T extends object>(lifecycle: Lifecycle<T>): ReadyValue<T>;
  register(lifecycle: Lifecycle<unknown>): ReadyValue<object> | undefined {
    const readyValue = createReadyValue<object>();
    this.lifecycles.push({ lc: lifecycle, readyValue });
    return readyValue;
  }

  /** @throws {AggregateError | ZeltReadyFailedError | ZeltLifecycleStateError} */
  async startup(): Promise<void> {
    await this.startupPending();
  }

  /** @throws {AggregateError | ZeltReadyFailedError | ZeltLifecycleStateError} */
  async startupPending(): Promise<void> {
    this.assertCanStart();
    await this.startPendingLifecycles();
  }

  /** @throws {ZeltLifecycleStateError} */
  private assertCanStart(): void {
    if (this.disposed) {
      throw new ZeltLifecycleStateError({ operation: 'startup', currentState: 'disposed' });
    }
  }

  /** @throws {AggregateError | ZeltReadyFailedError} */
  private async startPendingLifecycles(): Promise<void> {
    while (this.startedIndex < this.lifecycles.length) {
      const entry = this.lifecycles[this.startedIndex];
      if (entry) {
        try {
          const result = await entry.lc.startup();
          // Count the lifecycle as started before sealing its ReadyValue. If
          // sealing fails, the resource returned by startup still needs rollback.
          this.startedIndex++;
          if (result && typeof result === 'object' && entry.readyValue) {
            sealReadyValue(entry.readyValue, result);
          }
        } catch (cause) {
          await this.failStartup(cause, this.getLifecycleName(entry.lc));
        }
        continue;
      }
      this.startedIndex++;
    }
  }

  /** @throws {AggregateError | ZeltLifecycleStateError | ZeltReadyFailedError} */
  private async failStartup(cause: unknown, lifecycleName: string): Promise<never> {
    this.disposed = true;
    const rollbackErrors = await this.stopStartedLifecycles();
    rollbackErrors.push(...this.disposeReadyValues());
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [new ZeltReadyFailedError({ lifecycleName }, cause), ...rollbackErrors],
        'Lifecycle startup failed and rollback encountered errors',
      );
    }
    throw new ZeltReadyFailedError({ lifecycleName }, cause);
  }

  private getLifecycleName(lifecycle: Lifecycle<unknown>): string {
    return lifecycle.constructor.name || '<anonymous>';
  }

  private async stopStartedLifecycles(): Promise<unknown[]> {
    const errors: unknown[] = [];
    while (this.startedIndex > 0) {
      this.startedIndex--;
      const entry = this.lifecycles[this.startedIndex];
      if (!entry) continue;
      try {
        await entry.lc.shutdown();
      } catch (error) {
        errors.push(error);
      } finally {
        if (entry.readyValue) {
          try {
            disposeReadyValue(entry.readyValue);
          } catch (error) {
            errors.push(error);
          }
        }
      }
    }
    return errors;
  }

  private disposeReadyValues(): unknown[] {
    const errors: unknown[] = [];
    for (const entry of this.lifecycles) {
      if (!entry.readyValue) continue;
      try {
        disposeReadyValue(entry.readyValue);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  /** @throws {AggregateError} */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.disposed = true;
    this.shutdownPromise = this.doShutdown();
    return this.shutdownPromise;
  }

  /** @throws {AggregateError} */
  private async doShutdown(): Promise<void> {
    const errors = await this.stopStartedLifecycles();
    errors.push(...this.disposeReadyValues());
    if (errors.length > 0) {
      throw new AggregateError(errors, 'One or more lifecycle shutdown hooks failed');
    }
  }
}
