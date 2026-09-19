import { LifecycleManager, ZeltLifecycleStateError } from '@zeltjs/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database.service';

type Client = { query: (sql: string) => string };

class MockDatabaseService extends DatabaseService<Client> {
  setupCalled = false;
  shutdownCalled = false;
  transactionCalls: unknown[] = [];

  async setup() {
    this.setupCalled = true;
    return { client: { query: (sql: string) => `result: ${sql}` } };
  }

  async transaction<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
    const transactionNumber = this.transactionCalls.length + 1;
    const tx = { query: (sql: string) => `tx-${transactionNumber}: ${sql}` };
    this.transactionCalls.push({ client, tx });
    return fn(tx);
  }

  async shutdown() {
    this.shutdownCalled = true;
  }
}

type Handle = { close: () => void; closed: boolean };

class MockDatabaseServiceWithHandle extends DatabaseService<
  Client,
  { client: Client; handle: Handle }
> {
  // Captured separately from `this.ready` so tests can observe it after
  // shutdown disposes the ReadyValue.
  private capturedHandle: Handle | undefined;

  async setup() {
    const handle: Handle = { closed: false, close: () => {} };
    handle.close = () => {
      handle.closed = true;
    };
    this.capturedHandle = handle;
    return { client: { query: (sql: string) => `result: ${sql}` }, handle };
  }

  async transaction<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
    return fn(client);
  }

  async shutdown() {
    this.ready.handle.close();
  }

  wasClosed(): boolean {
    return this.capturedHandle?.closed ?? false;
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

  describe('pre-startup access', () => {
    it('should throw ZeltLifecycleStateError when client is read before startup', () => {
      const freshLifecycle = new LifecycleManager();
      const freshService = new MockDatabaseService(freshLifecycle);

      expect(() => freshService.client).toThrow(ZeltLifecycleStateError);
    });
  });

  describe('extra ready state', () => {
    it('exposes non-client values sealed into ready for use during shutdown', async () => {
      const handleLifecycle = new LifecycleManager();
      const handleService = new MockDatabaseServiceWithHandle(handleLifecycle);
      await handleLifecycle.startup();

      expect(handleService.client.query('x')).toBe('result: x');

      await handleLifecycle.shutdown();

      expect(handleService.wasClosed()).toBe(true);
    });
  });
});
