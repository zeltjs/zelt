import { AsyncLocalStorage } from 'node:async_hooks';

import type { Lifecycle } from '@zeltjs/core';
import { inject, LifecycleManager } from '@zeltjs/core';

export abstract class DatabaseService<TDatabase> implements Lifecycle<{ client: TDatabase }> {
  private readonly ready;
  private readonly txStorage = new AsyncLocalStorage<TDatabase>();

  constructor(lifecycle = inject(LifecycleManager)) {
    this.ready = lifecycle.register(this);
  }

  async startup(): Promise<{ client: TDatabase }> {
    return { client: await this.setup() };
  }

  abstract setup(): Promise<TDatabase>;

  abstract transaction<T>(client: TDatabase, fn: (tx: TDatabase) => Promise<T>): Promise<T>;

  abstract shutdown(): Promise<void>;

  get client(): TDatabase {
    return this.txStorage.getStore() ?? this.ready.client;
  }

  withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.txStorage.getStore();
    const targetClient = current ?? this.ready.client;

    return this.transaction(targetClient, (tx) => this.txStorage.run(tx, fn));
  }
}
