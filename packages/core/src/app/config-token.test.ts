import { describe, expect, it } from 'vitest';

import { Config } from '../built-in-service/config';
import { createApp } from './create-app.lib';

describe('config token', () => {
  describe('Config resolution priority', () => {
    // Priority (high to low):
    // 1. ready({ configs }) — override
    // 2. createApp([], { configs }) — user-provided
    // 3. ready({ fallbackConfigs }) — fallback
    // 4. BaseConfig default getter value

    @Config
    class BaseConfig {
      get value() {
        return 'base-default';
      }
    }

    class UserConfig extends BaseConfig {
      override get value() {
        return 'user-config';
      }
    }

    class FallbackConfig extends BaseConfig {
      override get value() {
        return 'fallback';
      }
    }

    class OverrideConfig extends BaseConfig {
      override get value() {
        return 'override';
      }
    }

    it('returns base default when nothing is configured', async () => {
      const app = createApp([]);
      const readyApp = await app.ready();
      expect((await readyApp.get(BaseConfig)).value).toBe('base-default');
    });

    it('fallback wins over base default', async () => {
      const app = createApp([]);
      const readyApp = await app.ready({ fallbackConfigs: [FallbackConfig] });
      expect((await readyApp.get(BaseConfig)).value).toBe('fallback');
    });

    it('configs wins over fallback', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.ready({ fallbackConfigs: [FallbackConfig] });
      expect((await readyApp.get(BaseConfig)).value).toBe('user-config');
    });

    it('configs wins over base default', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.ready();
      expect((await readyApp.get(BaseConfig)).value).toBe('user-config');
    });

    it('override wins over configs', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.ready({ configs: [OverrideConfig] });
      expect((await readyApp.get(BaseConfig)).value).toBe('override');
    });

    it('override wins over fallback', async () => {
      const app = createApp([]);
      const readyApp = await app.ready({
        fallbackConfigs: [FallbackConfig],
        configs: [OverrideConfig],
      });
      expect((await readyApp.get(BaseConfig)).value).toBe('override');
    });

    it('override wins over all (configs + fallback + base)', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.ready({
        fallbackConfigs: [FallbackConfig],
        configs: [OverrideConfig],
      });
      expect((await readyApp.get(BaseConfig)).value).toBe('override');
    });

    it('explicit base in configs prevents fallback', async () => {
      const app = createApp([], { configs: [BaseConfig] });
      const readyApp = await app.ready({ fallbackConfigs: [FallbackConfig] });
      expect((await readyApp.get(BaseConfig)).value).toBe('base-default');
    });
  });

  describe('implicit config resolution', () => {
    it('resolves config without explicit registration', async () => {
      @Config
      class ImplicitConfig {
        get value() {
          return 'implicit';
        }
      }

      const app = createApp([]);
      const readyApp = await app.ready();
      expect((await readyApp.get(ImplicitConfig)).value).toBe('implicit');
    });
  });

  describe('multiple independent configs', () => {
    it('each config tree resolves independently', async () => {
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

      class UserDbConfig extends DbConfig {
        override get url() {
          return 'db://user';
        }
      }

      class FallbackCacheConfig extends CacheConfig {
        override get url() {
          return 'cache://fallback';
        }
      }

      const app = createApp([], { configs: [UserDbConfig] });
      const readyApp = await app.ready({ fallbackConfigs: [FallbackCacheConfig] });

      expect((await readyApp.get(DbConfig)).url).toBe('db://user');
      expect((await readyApp.get(CacheConfig)).url).toBe('cache://fallback');
    });
  });
});
