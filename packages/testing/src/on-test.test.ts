import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, Controller, Get, Config, injectConfig } from '@zeltjs/core';

import { configureTestDefaults } from './global-config';
import { onTest } from './on-test';

// Isolated base config used only for the global-default test
@Config
class DbConfig {
  get url() {
    return 'prod://db';
  }
}

@Config
class TestDbConfig extends DbConfig {
  override get url() {
    return 'test://db';
  }
}

// Separate base config for the inline-override test to avoid multi-binding conflicts
// caused by needle-di's inheritance scanning when multiple @Config subclasses share a parent
@Config
class DbConfig2 {
  get url() {
    return 'prod2://db';
  }
}

@Config
class InlineDbConfig extends DbConfig2 {
  override get url() {
    return 'inline://db';
  }
}

beforeAll(() => {
  configureTestDefaults({ configs: [TestDbConfig] });
});

describe('onTest', () => {
  it('applies global test config replacements', async () => {
    @Controller('/')
    class TestController {
      constructor(private db = injectConfig(DbConfig)) {}
      @Get('/')
      get() {
        return { url: this.db.url };
      }
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [DbConfig],
    });

    const testApp = await onTest(app);
    const res = await testApp.request('/');
    const body: { url: string } = await res.json();

    expect(body.url).toBe('test://db');
  });

  it('inline config overrides global defaults', async () => {
    @Controller('/')
    class InlineTestController {
      constructor(private db = injectConfig(DbConfig2)) {}
      @Get('/')
      get() {
        return { url: this.db.url };
      }
    }

    const app = createApp({
      http: { controllers: [InlineTestController] },
      configs: [DbConfig2],
    });

    const testApp = await onTest(app, {
      configs: [InlineDbConfig],
    });

    const res = await testApp.request('/');
    const body: { url: string } = await res.json();

    expect(body.url).toBe('inline://db');
  });
});
