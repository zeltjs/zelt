import type { Lifecycle } from '@zeltjs/core';
import { createContextStorage, inject, LifecycleManager } from '@zeltjs/core';

export abstract class DatabaseService<TDatabase> implements Lifecycle<{ client: TDatabase }> {
  private readonly ready;
  private readonly txStorage = createContextStorage<TDatabase>('zelt:db:transaction');

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
    return this.txStorage.get() ?? this.ready.client;
  }

  withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.txStorage.get();
    const targetClient = current ?? this.ready.client;

    return this.transaction(targetClient, (tx) => this.txStorage.run(tx, fn));
  }
}
