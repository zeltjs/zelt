import { describe, expect, it } from 'vitest';
import { createApp } from '../../app/index';
import { Injectable, inject, ZeltAppConfigurationError } from '../../kernel';
import { Config } from './index';

describe('config token', () => {
  describe('Config resolution priority', () => {
    // Priority (high to low):
    // 1. createRuntime({ configs }) — override
    // 2. createApp([], { configs }) — user-provided
    // 3. createRuntime({ fallbackConfigs }) — fallback
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
      const readyApp = await app.createRuntime();
      expect((await readyApp.get(BaseConfig)).value).toBe('base-default');
    });

    it('fallback wins over base default', async () => {
      const app = createApp([]);
      const readyApp = await app.createRuntime({ fallbackConfigs: [FallbackConfig] });
      expect((await readyApp.get(BaseConfig)).value).toBe('fallback');
    });

    it('configs wins over fallback', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.createRuntime({ fallbackConfigs: [FallbackConfig] });
      expect((await readyApp.get(BaseConfig)).value).toBe('user-config');
    });

    it('configs wins over base default', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.createRuntime();
      expect((await readyApp.get(BaseConfig)).value).toBe('user-config');
    });

    it('override wins over configs', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.createRuntime({ configs: [OverrideConfig] });
      expect((await readyApp.get(BaseConfig)).value).toBe('override');
    });

    it('override wins over fallback', async () => {
      const app = createApp([]);
      const readyApp = await app.createRuntime({
        fallbackConfigs: [FallbackConfig],
        configs: [OverrideConfig],
      });
      expect((await readyApp.get(BaseConfig)).value).toBe('override');
    });

    it('override wins over all (configs + fallback + base)', async () => {
      const app = createApp([], { configs: [UserConfig] });
      const readyApp = await app.createRuntime({
        fallbackConfigs: [FallbackConfig],
        configs: [OverrideConfig],
      });
      expect((await readyApp.get(BaseConfig)).value).toBe('override');
    });

    it('explicit base in configs prevents fallback', async () => {
      const app = createApp([], { configs: [BaseConfig] });
      const readyApp = await app.createRuntime({ fallbackConfigs: [FallbackConfig] });
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
      const readyApp = await app.createRuntime();
      expect((await readyApp.get(ImplicitConfig)).value).toBe('implicit');
    });
  });

  describe('abstract config tokens', () => {
    it('resolves an abstract config token from a configured leaf class', async () => {
      @Config({ abstract: true })
      abstract class AbstractConfig {
        abstract get value(): string;
      }

      class ConcreteConfig extends AbstractConfig {
        override get value() {
          return 'concrete';
        }
      }

      @Injectable()
      class ConfigConsumer {
        constructor(public readonly config = inject(AbstractConfig)) {}
      }

      const app = createApp([], { configs: [ConcreteConfig] });
      const readyApp = await app.createRuntime();

      expect((await readyApp.get(ConfigConsumer)).config.value).toBe('concrete');
    });

    it('fails during startup when an abstract config token has no concrete leaf', async () => {
      @Config({ abstract: true })
      abstract class AbstractConfig {
        abstract get value(): string;
      }

      const app = createApp([], { configs: [AbstractConfig] });

      await expect(app.createRuntime()).rejects.toThrow(
        'Abstract config class AbstractConfig requires a concrete config class',
      );
    });

    it('fails during startup when an abstract override remains after fallback config registration', async () => {
      @Config({ abstract: true })
      abstract class AbstractConfig {
        abstract get value(): string;
      }

      class FallbackConcreteConfig extends AbstractConfig {
        override get value() {
          return 'fallback';
        }
      }

      const app = createApp([], { configs: [AbstractConfig] });

      await expect(
        app.createRuntime({ fallbackConfigs: [FallbackConcreteConfig] }),
      ).rejects.toThrow('Abstract config class AbstractConfig requires a concrete config class');
    });

    it('fails when an unconfigured abstract config token is injected', async () => {
      @Config({ abstract: true })
      abstract class AbstractConfig {
        abstract getValue(): string;
      }

      @Injectable()
      class ConfigConsumer {
        constructor(public readonly config = inject(AbstractConfig)) {}
      }

      const app = createApp([], { configs: [] });
      const readyApp = await app.createRuntime();
      const getConsumer = readyApp.get(ConfigConsumer);

      await expect(getConsumer).rejects.toThrow(ZeltAppConfigurationError);
      await expect(getConsumer).rejects.toThrow(
        'Abstract config class AbstractConfig requires a concrete config class',
      );
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
      const readyApp = await app.createRuntime({ fallbackConfigs: [FallbackCacheConfig] });

      expect((await readyApp.get(DbConfig)).url).toBe('db://user');
      expect((await readyApp.get(CacheConfig)).url).toBe('cache://fallback');
    });
  });
});
