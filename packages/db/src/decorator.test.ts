import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from './database-service';
import { createTransactionDecorator } from './decorator';

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
}

const mockService = new MockDatabaseService();

vi.mock('@zeltjs/core', () => ({
  inject: vi.fn((cls: unknown) => {
    if (cls === MockDatabaseService) return mockService;
    return { register: vi.fn() };
  }),
  LifecycleManager: class {},
}));

describe('createTransactionDecorator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockService.withTransactionCalls = [];
  });

  it('should create a Transaction decorator factory', () => {
    const Transaction = createTransactionDecorator(MockDatabaseService);

    expect(typeof Transaction).toBe('function');
  });

  it('should wrap method in withTransaction when decorated', async () => {
    const Transaction = createTransactionDecorator(MockDatabaseService);

    class TestService {
      @Transaction()
      async doWork(value: number): Promise<number> {
        return value * 2;
      }
    }

    const testService = new TestService();
    const result = await testService.doWork(5);

    expect(result).toBe(10);
    expect(mockService.withTransactionCalls).toHaveLength(1);
  });

  it('should preserve method arguments and return value', async () => {
    const Transaction = createTransactionDecorator(MockDatabaseService);

    class TestService {
      @Transaction()
      async add(a: number, b: number): Promise<number> {
        return a + b;
      }
    }

    const testService = new TestService();
    const result = await testService.add(3, 4);

    expect(result).toBe(7);
  });
});
