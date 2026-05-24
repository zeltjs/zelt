import { describe, expect, it } from 'vitest';

import { Config } from '../built-in-service/config';
import { createApp } from './create-app';

describe('config token', () => {
  describe('single @Config', () => {
    it('configs に含めると get で取得できる', async () => {
      @Config
      class AppConfig {
        get name() {
          return 'app';
        }
      }

      const app = createApp({ configs: [AppConfig] });
      const { get } = await app.ready();
      const config = get(AppConfig);
      expect(config.name).toBe('app');
    });

    it('configs に含めなくても get で取得できる', async () => {
      @Config
      class ImplicitConfig {
        get value() {
          return 'implicit';
        }
      }

      const app = createApp({});
      const { get } = await app.ready();
      const config = get(ImplicitConfig);
      expect(config.value).toBe('implicit');
    });
  });

  describe('override: @Config + child', () => {
    it('configs に child を含めると get(root) で child が返る', async () => {
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

      const app = createApp({ configs: [UserConfig] });
      const { get } = await app.ready();
      const config = get(BaseConfig);
      expect(config.value).toBe('user');
    });
  });

  describe('fallback: @Config + defaults', () => {
    it('defaults に fallback を含めると get(root) で fallback が返る', async () => {
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

      const app = createApp({});
      app.addFallbackConfig(FallbackConfig);
      const { get } = await app.ready();
      const config = get(BaseConfig);
      expect(config.value).toBe('fallback');
    });
  });

  describe('priority: configs > defaults > @Config default', () => {
    it('configs の child が defaults の fallback に勝つ', async () => {
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

      const app = createApp({ configs: [UserConfig] });
      app.addFallbackConfig(FallbackConfig);
      const { get } = await app.ready();
      const config = get(BaseConfig);
      expect(config.value).toBe('user');
    });

    it('overrides は configs に勝つ', async () => {
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

      const app = createApp({ configs: [UserConfig] });
      app.overrideConfig(TestConfig);
      const { get } = await app.ready();
      const config = get(BaseConfig);
      expect(config.value).toBe('test');
    });

    it('configs に root 自身を含めると defaults の fallback は使われない', async () => {
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

      const app = createApp({ configs: [BaseConfig] });
      app.addFallbackConfig(FallbackConfig);
      const { get } = await app.ready();
      const config = get(BaseConfig);
      expect(config.value).toBe('base');
    });

    it('configs も defaults もなければ root config 自身が返る', async () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      const app = createApp({});
      const { get } = await app.ready();
      const config = get(BaseConfig);
      expect(config.value).toBe('base');
    });
  });

  describe('multiple independent hierarchies', () => {
    it('異なる hierarchy の config は独立して動作する', async () => {
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

      const app = createApp({ configs: [UserDbConfig] });
      app.addFallbackConfig(FallbackCacheConfig);
      const { get } = await app.ready();

      expect(get(DbConfig).url).toBe('db://user');
      expect(get(CacheConfig).url).toBe('cache://fallback');
    });
  });
});
