import { AsyncLocalStorage } from 'node:async_hooks';

import type { Lifecycle } from '@zeltjs/core';
import { inject, LifecycleManager } from '@zeltjs/core';

export abstract class DatabaseService<TDatabase> implements Lifecycle {
  private readonly txStorage = new AsyncLocalStorage<TDatabase>();
  protected originalClient!: TDatabase;
  private readonly shutdownHandlers: (() => Promise<void>)[] = [];

  constructor(lifecycle = inject(LifecycleManager)) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    this.originalClient = await this.setup();
  }

  abstract setup(): Promise<TDatabase>;

  abstract transaction<T>(client: TDatabase, fn: (tx: TDatabase) => Promise<T>): Promise<T>;

  get client(): TDatabase {
    return this.txStorage.getStore() ?? this.originalClient;
  }

  withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.txStorage.getStore();
    const targetClient = current ?? this.originalClient;

    return this.transaction(targetClient, (tx) => this.txStorage.run(tx, fn));
  }

  protected onShutdown(fn: () => Promise<void>): void {
    this.shutdownHandlers.push(fn);
  }

  async shutdown(): Promise<void> {
    for (const handler of [...this.shutdownHandlers].reverse()) {
      await handler();
    }
  }
}
