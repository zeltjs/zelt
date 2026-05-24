import { injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { createContainer } from '../../kernel/di/container';
import { inject } from '../../kernel/di/inject';
import { Config } from './decorator';

describe('config token', () => {
  describe('single @Config', () => {
    it('configs に含めると inject で取得できる', () => {
      @Config
      class AppConfig {
        get name() {
          return 'app';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(AppConfig)) {}
        getName() {
          return this.config.name;
        }
      }

      const resolver = createContainer({ configs: [AppConfig] });
      expect(resolver.get(Service).getName()).toBe('app');
    });

    it('configs に含めなくても inject で取得できる', () => {
      @Config
      class ImplicitConfig {
        get value() {
          return 'implicit';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(ImplicitConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const resolver = createContainer({ configs: [] });
      expect(resolver.get(Service).getValue()).toBe('implicit');
    });
  });

  describe('override: @Config + child', () => {
    it('configs に child を含めると inject(root) で child が返る', () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      @Config
      class UserConfig extends BaseConfig {
        override get value() {
          return 'user';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(BaseConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const resolver = createContainer({ configs: [UserConfig] });
      expect(resolver.get(Service).getValue()).toBe('user');
    });
  });

  describe('fallback: @Config + defaults', () => {
    it('defaults に fallback を含めると inject(root) で fallback が返る', () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      @Config
      class FallbackConfig extends BaseConfig {
        override get value() {
          return 'fallback';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(BaseConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const resolver = createContainer({ defaults: [FallbackConfig] });
      expect(resolver.get(Service).getValue()).toBe('fallback');
    });
  });

  describe('priority: configs > defaults > @Config default', () => {
    it('configs の child が defaults の fallback に勝つ', () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      @Config
      class FallbackConfig extends BaseConfig {
        override get value() {
          return 'fallback';
        }
      }

      @Config
      class UserConfig extends BaseConfig {
        override get value() {
          return 'user';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(BaseConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const resolver = createContainer({ configs: [UserConfig], defaults: [FallbackConfig] });
      expect(resolver.get(Service).getValue()).toBe('user');
    });

    it('overrides は configs に勝つ', () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      @Config
      class UserConfig extends BaseConfig {
        override get value() {
          return 'user';
        }
      }

      @Config
      class TestConfig extends BaseConfig {
        override get value() {
          return 'test';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(BaseConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const resolver = createContainer({ configs: [UserConfig], overrides: [TestConfig] });
      expect(resolver.get(Service).getValue()).toBe('test');
    });

    it('configs に root 自身を含めると defaults の fallback は使われない', () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      @Config
      class FallbackConfig extends BaseConfig {
        override get value() {
          return 'fallback';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(BaseConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const resolver = createContainer({ configs: [BaseConfig], defaults: [FallbackConfig] });
      expect(resolver.get(Service).getValue()).toBe('base');
    });

    it('configs も defaults もなければ root config 自身が返る', () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      @injectable()
      class Service {
        constructor(private config = inject(BaseConfig)) {}
        getValue() {
          return this.config.value;
        }
      }

      const resolver = createContainer({});
      expect(resolver.get(Service).getValue()).toBe('base');
    });
  });

  describe('multiple independent hierarchies', () => {
    it('異なる hierarchy の config は独立して動作する', () => {
      @Config
      class DbConfig {
        get url() {
          return 'db://default';
        }
      }

      @Config
      class CacheConfig {
        get url() {
          return 'cache://default';
        }
      }

      @Config
      class UserDbConfig extends DbConfig {
        override get url() {
          return 'db://user';
        }
      }

      @Config
      class FallbackCacheConfig extends CacheConfig {
        override get url() {
          return 'cache://fallback';
        }
      }

      @injectable()
      class Service {
        constructor(
          private db = inject(DbConfig),
          private cache = inject(CacheConfig),
        ) {}
        getDbUrl() {
          return this.db.url;
        }
        getCacheUrl() {
          return this.cache.url;
        }
      }

      const resolver = createContainer({
        configs: [UserDbConfig],
        defaults: [FallbackCacheConfig],
      });
      const service = resolver.get(Service);
      expect(service.getDbUrl()).toBe('db://user');
      expect(service.getCacheUrl()).toBe('cache://fallback');
    });
  });
});
