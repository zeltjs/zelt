import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from './database-service';

class MockDatabaseService extends DatabaseService<{ query: (sql: string) => string }> {
  setupCalled = false;
  transactionCalls: unknown[] = [];

  async setup() {
    this.setupCalled = true;
    return { query: (sql: string) => `result: ${sql}` };
  }

  async transaction<T>(
    client: { query: (sql: string) => string },
    fn: (tx: { query: (sql: string) => string }) => Promise<T>,
  ): Promise<T> {
    this.transactionCalls.push({ client });
    return fn(client);
  }
}

const mockLifecycleManager = {
  register: vi.fn(),
};

vi.mock('@zeltjs/core', () => ({
  inject: vi.fn(() => mockLifecycleManager),
  LifecycleManager: class {},
}));

describe('DatabaseService', () => {
  let service: MockDatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MockDatabaseService();
  });

  describe('lifecycle', () => {
    it('should register with LifecycleManager on construction', () => {
      expect(mockLifecycleManager.register).toHaveBeenCalledWith(service);
    });

    it('should call setup() on startup and set originalClient', async () => {
      await service.startup();

      expect(service.setupCalled).toBe(true);
      expect(service.client.query('test')).toBe('result: test');
    });
  });

  describe('client getter', () => {
    it('should return originalClient when not in transaction', async () => {
      await service.startup();

      const result = service.client.query('SELECT 1');

      expect(result).toBe('result: SELECT 1');
    });
  });

  describe('withTransaction', () => {
    it('should execute function within transaction context', async () => {
      await service.startup();

      const result = await service.withTransaction(async () => {
        return service.client.query('SELECT * FROM users');
      });

      expect(result).toBe('result: SELECT * FROM users');
      expect(service.transactionCalls).toHaveLength(1);
    });

    it('should provide tx client inside transaction', async () => {
      await service.startup();
      let clientInsideTx: { query: (sql: string) => string } | undefined;

      await service.withTransaction(async () => {
        clientInsideTx = service.client;
      });

      expect(clientInsideTx).toBeDefined();
    });
  });

  describe('nested transactions', () => {
    it('should use current tx client for nested withTransaction', async () => {
      await service.startup();
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
      await service.startup();
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
  });

  describe('shutdown', () => {
    it('should call shutdown handlers in reverse order', async () => {
      await service.startup();
      const order: number[] = [];
      service['onShutdown'](async () => {
        order.push(1);
      });
      service['onShutdown'](async () => {
        order.push(2);
      });

      await service.shutdown();

      expect(order).toEqual([2, 1]);
    });
  });
});
