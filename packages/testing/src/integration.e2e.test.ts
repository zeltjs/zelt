import { Config, Controller, createApp, Get, Injectable, inject } from '@zeltjs/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { configureTestDefaults } from './global-config';
import { onTest } from './on-test';
import { createTestTarget } from './test-target';

// Shared config hierarchy for E2E tests
@Config
class DatabaseConfig {
  get connectionString() {
    return 'prod://database';
  }
}

@Config
class TestDatabaseConfig extends DatabaseConfig {
  override get connectionString() {
    return 'test://database';
  }
}

// Register global test defaults once
beforeAll(() => {
  configureTestDefaults({ configs: [TestDatabaseConfig] });
});

describe('E2E: onTest with global config', () => {
  it('applies global config to HTTP app', async () => {
    @Controller('/')
    class DbController {
      constructor(private db = inject(DatabaseConfig)) {}
      @Get('/db')
      getDbInfo() {
        return { connection: this.db.connectionString };
      }
    }

    const app = createApp({
      http: { controllers: [DbController] },
      configs: [DatabaseConfig],
    });

    const testApp = await onTest(app);
    const res = await testApp.request('/db');
    const body: { connection: string } = await res.json();

    expect(body.connection).toBe('test://database');
  });
});

describe('E2E: createTestTarget with global config', () => {
  it('applies global config to service', async () => {
    @Injectable()
    class DbService {
      constructor(private db = inject(DatabaseConfig)) {}
      getConnection() {
        return this.db.connectionString;
      }
    }

    const { target } = await createTestTarget(DbService, {
      configs: [DatabaseConfig],
    });

    expect(target.getConnection()).toBe('test://database');
  });
});

describe('E2E: inline config overrides global', () => {
  @Config
  class CacheConfig {
    get ttl() {
      return 3600;
    }
  }

  @Config
  class InlineCacheConfig extends CacheConfig {
    override get ttl() {
      return 1;
    }
  }

  it('inline overrides global in onTest', async () => {
    @Controller('/')
    class CacheController {
      constructor(private cache = inject(CacheConfig)) {}
      @Get('/ttl')
      getTtl() {
        return { ttl: this.cache.ttl };
      }
    }

    const app = createApp({
      http: { controllers: [CacheController] },
      configs: [CacheConfig],
    });

    const testApp = await onTest(app, { configs: [InlineCacheConfig] });
    const res = await testApp.request('/ttl');
    const body: { ttl: number } = await res.json();

    expect(body.ttl).toBe(1);
  });

  it('inline overrides global in createTestTarget', async () => {
    @Injectable()
    class CacheService {
      constructor(private cache = inject(CacheConfig)) {}
      getTtl() {
        return this.cache.ttl;
      }
    }

    const { target } = await createTestTarget(CacheService, {
      configs: [InlineCacheConfig],
    });

    expect(target.getTtl()).toBe(1);
  });
});
