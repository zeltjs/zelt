import { injectable } from '@needle-di/core';
import type { ReadyValue } from './internal';
import { createReadyValue, disposeReadyValue, sealReadyValue } from './internal';

export interface Disposable {
  shutdown(): Promise<void>;
}

export interface Lifecycle<TReady = void> extends Disposable {
  /** @throws {ZeltNotImplementedError} */
  startup(): Promise<TReady>;
}

type WarmupHandler = () => Promise<void>;

type LifecycleEntry = {
  lc: Lifecycle<unknown>;
  readyValue?: ReadyValue<object>;
};

@injectable()
export class LifecycleManager {
  private readonly lifecycles: LifecycleEntry[] = [];
  private startedIndex = 0;
  private readonly warmupHandlers: WarmupHandler[] = [];

  register(lifecycle: Lifecycle<void>): void;
  register<T extends object>(lifecycle: Lifecycle<T>): ReadyValue<T>;
  register(lifecycle: Lifecycle<unknown>): ReadyValue<object> | undefined {
    const readyValue = createReadyValue<object>();
    this.lifecycles.push({ lc: lifecycle, readyValue });
    return readyValue;
  }

  registerWarmup(handler: WarmupHandler): void {
    this.warmupHandlers.push(handler);
  }

  async startup(): Promise<void> {
    await this.startupPending();
  }

  /** @throws {ZeltLifecycleStateError} */
  async startupPending(): Promise<void> {
    while (this.startedIndex < this.lifecycles.length) {
      const entry = this.lifecycles[this.startedIndex];
      if (entry) {
        const result = await entry.lc.startup();
        if (result && typeof result === 'object' && entry.readyValue) {
          sealReadyValue(entry.readyValue, result);
        }
      }
      this.startedIndex++;
    }
  }

  async warmup(): Promise<void> {
    for (const handler of this.warmupHandlers) {
      await handler();
    }
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
