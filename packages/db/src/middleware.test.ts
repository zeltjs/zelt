import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from './database.service';
import { createTransactionMiddleware } from './transaction.middleware';

class MockDatabaseService extends DatabaseService<{ id: string }> {
  withTransactionCalls: (() => Promise<unknown>)[] = [];

  async setup() {
    return { id: 'mock-client' };
  }

  async transaction<T>(client: { id: string }, fn: (tx: { id: string }) => Promise<T>): Promise<T> {
    return fn(client);
  }

  override withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.withTransactionCalls.push(fn as () => Promise<unknown>);
    return fn();
  }

  async shutdown() {}
}

const mockService = new MockDatabaseService();

vi.mock('@zeltjs/core', () => ({
  createContextStorage: () => ({
    get: () => undefined,
    run: (_value: unknown, fn: () => unknown) => fn(),
  }),
  inject: vi.fn((cls: unknown) => {
    if (cls === MockDatabaseService) return mockService;
    return { register: vi.fn() };
  }),
  Middleware: (target: unknown) => target,
  LifecycleManager: class {},
}));

describe('createTransactionMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockService.withTransactionCalls = [];
  });

  it('should create a middleware class', () => {
    const TransactionMiddleware = createTransactionMiddleware(MockDatabaseService);

    expect(typeof TransactionMiddleware).toBe('function');
  });

  it('should wrap next() in withTransaction', async () => {
    const TransactionMiddleware = createTransactionMiddleware(MockDatabaseService);
    const middleware = new TransactionMiddleware();
    let nextCalled = false;

    await middleware.use(async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(mockService.withTransactionCalls).toHaveLength(1);
  });

  it('should return result from next()', async () => {
    const TransactionMiddleware = createTransactionMiddleware(MockDatabaseService);
    const middleware = new TransactionMiddleware();

    // use() returns Promise<Response | undefined>, next() returns Promise<void>
    // so the return value from next is discarded; we just verify it completes
    let nextCalled = false;
    const result = await middleware.use(async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(result).toBeUndefined();
  });
});
