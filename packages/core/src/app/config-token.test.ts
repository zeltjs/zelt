import { describe, expect, it } from 'vitest';

import { Config } from '../built-in-service/config';
import { inject } from '../kernel/di/inject';
import { Controller } from '../modules/http/decorators/controller';
import { Get } from '../modules/http/decorators/http-method';
import { createApp } from './create-app';

describe('config token', () => {
  describe('single @Config', () => {
    it('configs に含めると inject で取得できる', async () => {
      @Config
      class AppConfig {
        get name() {
          return 'app';
        }
      }

      @Controller('/')
      class TestController {
        constructor(private config = inject(AppConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.name };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [AppConfig],
      });
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'app' });
    });

    it('configs に含めなくても inject で取得できる', async () => {
      @Config
      class ImplicitConfig {
        get value() {
          return 'implicit';
        }
      }

      @Controller('/')
      class TestController {
        constructor(private config = inject(ImplicitConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.value };
        }
      }

      const app = createApp({ http: { controllers: [TestController] } });
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'implicit' });
    });
  });

  describe('override: @Config + child', () => {
    it('configs に child を含めると inject(root) で child が返る', async () => {
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

      @Controller('/')
      class TestController {
        constructor(private config = inject(BaseConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.value };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [UserConfig],
      });
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'user' });
    });
  });

  describe('fallback: @Config + defaults', () => {
    it('defaults に fallback を含めると inject(root) で fallback が返る', async () => {
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

      @Controller('/')
      class TestController {
        constructor(private config = inject(BaseConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.value };
        }
      }

      const app = createApp({ http: { controllers: [TestController] } });
      app.addFallbackConfig(FallbackConfig);
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'fallback' });
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

      @Controller('/')
      class TestController {
        constructor(private config = inject(BaseConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.value };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [UserConfig],
      });
      app.addFallbackConfig(FallbackConfig);
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'user' });
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

      @Controller('/')
      class TestController {
        constructor(private config = inject(BaseConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.value };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [UserConfig],
      });
      app.overrideConfig(TestConfig);
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'test' });
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

      @Controller('/')
      class TestController {
        constructor(private config = inject(BaseConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.value };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [BaseConfig],
      });
      app.addFallbackConfig(FallbackConfig);
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'base' });
    });

    it('configs も defaults もなければ root config 自身が返る', async () => {
      @Config
      class BaseConfig {
        get value() {
          return 'base';
        }
      }

      @Controller('/')
      class TestController {
        constructor(private config = inject(BaseConfig)) {}

        @Get('/value')
        getValue() {
          return { value: this.config.value };
        }
      }

      const app = createApp({ http: { controllers: [TestController] } });
      await app.ready();
      const res = await app.fetch(new Request('http://localhost/value'));
      expect(await res.json()).toEqual({ value: 'base' });
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

      @Controller('/')
      class TestController {
        constructor(
          private db = inject(DbConfig),
          private cache = inject(CacheConfig),
        ) {}

        @Get('/db')
        getDbUrl() {
          return { url: this.db.url };
        }

        @Get('/cache')
        getCacheUrl() {
          return { url: this.cache.url };
        }
      }

      const app = createApp({
        http: { controllers: [TestController] },
        configs: [UserDbConfig],
      });
      app.addFallbackConfig(FallbackCacheConfig);
      await app.ready();

      const dbRes = await app.fetch(new Request('http://localhost/db'));
      expect(await dbRes.json()).toEqual({ url: 'db://user' });

      const cacheRes = await app.fetch(new Request('http://localhost/cache'));
      expect(await cacheRes.json()).toEqual({ url: 'cache://fallback' });
    });
  });
});
