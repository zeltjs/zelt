import type { Lifecycle, ReadyValue } from '@zeltjs/core';
import { createContextStorage, inject, LifecycleManager } from '@zeltjs/core';

export abstract class DatabaseService<
  TDatabase,
  TReady extends { client: TDatabase } = { client: TDatabase },
> implements Lifecycle<TReady>
{
  // protected so a subclass can stash resources (e.g. a raw connection
  // handle) needed by shutdown() without a definite-assignment field.
  protected readonly ready: ReadyValue<TReady>;
  private readonly txStorage = createContextStorage<TDatabase>('zelt:db:transaction');

  constructor(lifecycle = inject(LifecycleManager)) {
    this.ready = lifecycle.register(this);
  }

  startup(): Promise<TReady> {
    return this.setup();
  }

  /** Create the client and any handles shutdown() needs; everything returned is sealed into `this.ready`. */
  abstract setup(): Promise<TReady>;

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
