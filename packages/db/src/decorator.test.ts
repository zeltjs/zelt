import { createApp, Injectable, inject } from '@zeltjs/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { DatabaseService } from './database.service';
import { createTransactionDecorator } from './db.decorator';

type Client = { readonly kind: 'base' | 'transaction'; active: boolean };
type TransactionCall = { readonly parent: Client; readonly tx: Client };

@Injectable()
class MemoryDatabase extends DatabaseService<Client> {
  readonly transactions: TransactionCall[] = [];

  setup(): Promise<{ client: Client }> {
    return Promise.resolve({ client: { kind: 'base', active: true } });
  }

  async transaction<T>(parent: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
    const tx: Client = { kind: 'transaction', active: true };
    this.transactions.push({ parent, tx });
    try {
      return await fn(tx);
    } finally {
      tx.active = false;
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const Transaction = createTransactionDecorator(MemoryDatabase);

@Injectable()
class OrderService {
  constructor(private db = inject(MemoryDatabase)) {}

  @Transaction()
  async place(quantity: number): Promise<{ quantity: number; client: Client }> {
    await Promise.resolve();
    return { quantity, client: { ...this.db.client } };
  }

  @Transaction()
  async placeTwice(): Promise<void> {
    await this.place(1);
    await this.place(2);
  }
}

const startRuntime = () => createApp([]).createRuntime({ contextMode: 'async' });

describe('createTransactionDecorator', () => {
  it('runs a method called after construction inside a transaction', async () => {
    const runtime = await startRuntime();
    try {
      const service = await runtime.get(OrderService);

      const result = await service.place(3);

      expect(result).toEqual({ quantity: 3, client: { kind: 'transaction', active: true } });
      const db = await runtime.get(MemoryDatabase);
      expect(db.transactions).toHaveLength(1);
      expect(db.client).toEqual({ kind: 'base', active: true });
    } finally {
      await runtime.shutdown();
    }
  });

  it('uses the database of the runtime that constructed the instance', async () => {
    const runtimeA = await startRuntime();
    const runtimeB = await startRuntime();
    try {
      const serviceA = await runtimeA.get(OrderService);
      await runtimeB.get(OrderService);

      await serviceA.place(3);

      expect((await runtimeA.get(MemoryDatabase)).transactions).toHaveLength(1);
      expect((await runtimeB.get(MemoryDatabase)).transactions).toHaveLength(0);
    } finally {
      await runtimeA.shutdown();
      await runtimeB.shutdown();
    }
  });

  it('rejects static methods at the type level', () => {
    // Never invoked: defining the class would run the static initializer outside DI.
    const defineStatic = () =>
      class {
        // @ts-expect-error static methods have no constructed instance to inject into
        @Transaction()
        static async run(): Promise<void> {}
      };
    expectTypeOf(defineStatic).toBeFunction();
  });

  it('nests inner decorated calls inside the outer transaction', async () => {
    const runtime = await startRuntime();
    try {
      const service = await runtime.get(OrderService);

      await service.placeTwice();

      const db = await runtime.get(MemoryDatabase);
      const [outer, ...inner] = db.transactions;
      expect(outer?.parent).toEqual({ kind: 'base', active: true });
      expect(inner).toHaveLength(2);
      expect(inner.every((call) => call.parent === outer?.tx)).toBe(true);
    } finally {
      await runtime.shutdown();
    }
  });
});
