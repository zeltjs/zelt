import { LifecycleManager } from '@zeltjs/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database.service';

class MockDatabaseService extends DatabaseService<{ query: (sql: string) => string }> {
  setupCalled = false;
  shutdownCalled = false;
  transactionCalls: unknown[] = [];

  async setup() {
    this.setupCalled = true;
    return { query: (sql: string) => `result: ${sql}` };
  }

  async transaction<T>(
    client: { query: (sql: string) => string },
    fn: (tx: { query: (sql: string) => string }) => Promise<T>,
  ): Promise<T> {
    const transactionNumber = this.transactionCalls.length + 1;
    const tx = { query: (sql: string) => `tx-${transactionNumber}: ${sql}` };
    this.transactionCalls.push({ client, tx });
    return fn(tx);
  }

  async shutdown() {
    this.shutdownCalled = true;
  }
}

describe('DatabaseService', () => {
  let lifecycle: LifecycleManager;
  let service: MockDatabaseService;

  beforeEach(async () => {
    lifecycle = new LifecycleManager();
    service = new MockDatabaseService(lifecycle);
    await lifecycle.startup();
  });

  describe('lifecycle', () => {
    it('should call setup() on startup and set client', () => {
      expect(service.setupCalled).toBe(true);
      expect(service.client.query('test')).toBe('result: test');
    });
  });

  describe('client getter', () => {
    it('should return client when not in transaction', () => {
      const result = service.client.query('SELECT 1');
      expect(result).toBe('result: SELECT 1');
    });
  });

  describe('withTransaction', () => {
    it('should execute function within transaction context', async () => {
      const result = await service.withTransaction(async () => {
        return service.client.query('SELECT * FROM users');
      });

      expect(result).toBe('tx-1: SELECT * FROM users');
      expect(service.transactionCalls).toHaveLength(1);
    });

    it('should provide tx client inside transaction', async () => {
      let clientInsideTx: { query: (sql: string) => string } | undefined;

      await service.withTransaction(async () => {
        clientInsideTx = service.client;
      });

      expect(clientInsideTx).toBeDefined();
    });
  });

  describe('nested transactions', () => {
    it('should use current tx client for nested withTransaction', async () => {
      const clients: unknown[] = [];

      await service.withTransaction(async () => {
        clients.push(service.client);
        await service.withTransaction(async () => {
          clients.push(service.client);
        });
        clients.push(service.client);
      });

      expect(service.transactionCalls).toHaveLength(2);
    });

    it('should restore previous tx context after nested transaction completes', async () => {
      let outerClientAfterNested: unknown;

      await service.withTransaction(async () => {
        const outerClient = service.client;
        await service.withTransaction(async () => {
          // nested
        });
        outerClientAfterNested = service.client;
        expect(outerClientAfterNested).toBe(outerClient);
      });
    });

    it('isolates concurrent transaction clients', async () => {
      const [first, second] = await Promise.all([
        service.withTransaction(async () => {
          const before = service.client.query('before');
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [before, service.client.query('after')];
        }),
        service.withTransaction(async () => {
          const before = service.client.query('before');
          await Promise.resolve();
          return [before, service.client.query('after')];
        }),
      ]);

      expect(first).toEqual(['tx-1: before', 'tx-1: after']);
      expect(second).toEqual(['tx-2: before', 'tx-2: after']);
      expect(service.client.query('outside')).toBe('result: outside');
    });
  });

  describe('shutdown', () => {
    it('should call subclass shutdown', async () => {
      await service.shutdown();
      expect(service.shutdownCalled).toBe(true);
    });
  });
});
