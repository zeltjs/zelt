import { injectable } from '@needle-di/core';
import { ZeltReadyFailedError } from './errors';
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

@injectable()
export class LifecycleManager {
  private readonly lifecycles: LifecycleEntry[] = [];
  private startedIndex = 0;

  register(lifecycle: Lifecycle<void>): void;
  register<T extends object>(lifecycle: Lifecycle<T>): ReadyValue<T>;
  register(lifecycle: Lifecycle<unknown>): ReadyValue<object> | undefined {
    const readyValue = createReadyValue<object>();
    this.lifecycles.push({ lc: lifecycle, readyValue });
    return readyValue;
  }

  /** @throws {ZeltReadyFailedError | ZeltLifecycleStateError} */
  async startup(): Promise<void> {
    await this.startupPending();
  }

  /** @throws {ZeltReadyFailedError | ZeltLifecycleStateError} */
  async startupPending(): Promise<void> {
    while (this.startedIndex < this.lifecycles.length) {
      const entry = this.lifecycles[this.startedIndex];
      if (entry) {
        const result = await this.startLifecycle(entry.lc);
        if (result && typeof result === 'object' && entry.readyValue) {
          sealReadyValue(entry.readyValue, result);
        }
      }
      this.startedIndex++;
    }
  }

  /** @throws {ZeltReadyFailedError | ZeltLifecycleStateError} */
  private async startLifecycle(lifecycle: Lifecycle<unknown>): Promise<unknown> {
    try {
      return await lifecycle.startup();
    } catch (cause) {
      if (cause instanceof ZeltReadyFailedError) {
        throw cause;
      }
      throw new ZeltReadyFailedError({ lifecycleName: this.getLifecycleName(lifecycle) }, cause);
    }
  }

  private getLifecycleName(lifecycle: Lifecycle<unknown>): string {
    return lifecycle.constructor.name || '<anonymous>';
  }

  /** @throws {ZeltLifecycleStateError} */
  async shutdown(): Promise<void> {
    for (let i = this.startedIndex - 1; i >= 0; i--) {
      const entry = this.lifecycles[i];
      if (entry) {
        await entry.lc.shutdown();
        if (entry.readyValue) {
          disposeReadyValue(entry.readyValue);
        }
      }
    }
  }
}
