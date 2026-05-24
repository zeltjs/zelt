import { injectable } from '@needle-di/core';

export interface Disposable {
  shutdown(): Promise<void>;
}

export interface Lifecycle extends Disposable {
  /** @throws {ZeltNotImplementedError} */
  startup(): Promise<void>;
}

type WarmupHandler = () => Promise<void>;

@injectable()
export class LifecycleManager {
  private readonly lifecycles: Lifecycle[] = [];
  private startedIndex = 0;
  private readonly warmupHandlers: WarmupHandler[] = [];

  register(lifecycle: Lifecycle): void {
    this.lifecycles.push(lifecycle);
  }

  registerWarmup(handler: WarmupHandler): void {
    this.warmupHandlers.push(handler);
  }

  async startup(): Promise<void> {
    await this.startupPending();
  }

  async startupPending(): Promise<void> {
    while (this.startedIndex < this.lifecycles.length) {
      const lc = this.lifecycles[this.startedIndex];
      if (lc) await lc.startup();
      this.startedIndex++;
    }
  }

  async warmup(): Promise<void> {
    for (const handler of this.warmupHandlers) {
      await handler();
    }
  }

  async shutdown(): Promise<void> {
    const stopAt = Math.max(this.startedIndex, this.lifecycles.length);
    for (let i = stopAt - 1; i >= 0; i--) {
      const lc = this.lifecycles[i];
      if (lc) await lc.shutdown();
    }
  }
}
