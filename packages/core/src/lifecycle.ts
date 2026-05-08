import { injectable } from '@needle-di/core';

export interface Disposable {
  shutdown(): Promise<void>;
}

export interface Lifecycle extends Disposable {
  startup(): Promise<void>;
}

@injectable()
export class LifecycleManager {
  private readonly lifecycles: Lifecycle[] = [];
  private startedIndex = 0;

  register(lifecycle: Lifecycle): void {
    this.lifecycles.push(lifecycle);
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

  async shutdown(): Promise<void> {
    const stopAt = Math.max(this.startedIndex, this.lifecycles.length);
    for (let i = stopAt - 1; i >= 0; i--) {
      const lc = this.lifecycles[i];
      if (lc) await lc.shutdown();
    }
  }
}
