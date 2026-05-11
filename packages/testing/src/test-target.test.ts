import { beforeAll, describe, expect, it } from 'vitest';
import { Injectable, inject, injectConfig, Config } from '@zeltjs/core';

import { configureTestDefaults } from './global-config';
import { createTestTarget } from './test-target';

describe('createTestTarget', () => {
  it('resolves a simple injectable class', async () => {
    @Injectable()
    class SimpleService {
      getValue() {
        return 'hello';
      }
    }

    const { target } = await createTestTarget(SimpleService);

    expect(target.getValue()).toBe('hello');
  });

  it('resolves with dependency injection', async () => {
    @Injectable()
    class Repository {
      getData() {
        return 'real-data';
      }
    }

    @Injectable()
    class Service {
      constructor(private repo = inject(Repository)) {}

      process() {
        return `processed: ${this.repo.getData()}`;
      }
    }

    const { target } = await createTestTarget(Service);

    expect(target.process()).toBe('processed: real-data');
  });

  it('allows overriding dependencies with mock values', async () => {
    @Injectable()
    class Repository {
      getData() {
        return 'real-data';
      }
    }

    @Injectable()
    class Service {
      constructor(private repo = inject(Repository)) {}

      process() {
        return `processed: ${this.repo.getData()}`;
      }
    }

    const mockRepo = {
      getData: () => 'mock-data',
    };

    const { target } = await createTestTarget(Service, {
      overrides: [{ provide: Repository, useValue: mockRepo as Repository }],
    });

    expect(target.process()).toBe('processed: mock-data');
  });

  it('exposes container.get for resolving additional dependencies', async () => {
    @Injectable()
    class ServiceA {
      name = 'A';
    }

    @Injectable()
    class ServiceB {
      name = 'B';
    }

    const { target, get } = await createTestTarget(ServiceA);

    expect(target.name).toBe('A');

    const serviceB = get(ServiceB);
    expect(serviceB.name).toBe('B');
  });

  it('works with class-based token injection', async () => {
    @Injectable()
    class ConfigService {
      apiUrl = 'https://default.api';
    }

    @Injectable()
    class ApiClient {
      constructor(private config = inject(ConfigService)) {}

      getUrl() {
        return this.config.apiUrl;
      }
    }

    const mockConfig = { apiUrl: 'https://test.api' };

    const { target } = await createTestTarget(ApiClient, {
      overrides: [{ provide: ConfigService, useValue: mockConfig as ConfigService }],
    });

    expect(target.getUrl()).toBe('https://test.api');
  });

  describe('global config defaults', () => {
    @Config
    class GlobalBaseConfig {
      get value() {
        return 'base';
      }
    }

    @Config
    class GlobalTestConfig extends GlobalBaseConfig {
      override get value() {
        return 'global-test';
      }
    }

    @Config
    class GlobalBaseConfig2 {
      get value() {
        return 'base2';
      }
    }

    @Config
    class InlineTestConfig extends GlobalBaseConfig2 {
      override get value() {
        return 'inline-test';
      }
    }

    beforeAll(() => {
      configureTestDefaults({ configs: [GlobalTestConfig] });
    });

    it('applies global config replacement', async () => {
      @Injectable()
      class ServiceWithConfig {
        constructor(private config = injectConfig(GlobalBaseConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const { target } = await createTestTarget(ServiceWithConfig, {
        configs: [GlobalBaseConfig],
      });

      expect(target.getValue()).toBe('global-test');
    });

    it('inline config overrides global defaults', async () => {
      @Injectable()
      class ServiceWithConfig2 {
        constructor(private config = injectConfig(GlobalBaseConfig2)) {}
        getValue() {
          return this.config.value;
        }
      }

      const { target } = await createTestTarget(ServiceWithConfig2, {
        configs: [InlineTestConfig],
      });

      expect(target.getValue()).toBe('inline-test');
    });
  });
});
