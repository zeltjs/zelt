import { Container, InjectionToken, inject, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

describe('needle-di InjectionToken requirements', () => {
  it('later bind wins over earlier bind', () => {
    const token = new InjectionToken<string>('test', {
      factory: () => 'default',
    });

    const container = new Container();
    container.bind({ provide: token, useValue: 'first' });
    container.bind({ provide: token, useValue: 'second' });

    expect(container.get(token)).toBe('second');
  });

  it('bind overrides factory default', () => {
    const token = new InjectionToken<string>('test', {
      factory: () => 'factory-default',
    });

    const container = new Container();
    container.bind({ provide: token, useValue: 'override' });

    expect(container.get(token)).toBe('override');
  });

  it('factory default is used when no bind', () => {
    const token = new InjectionToken<string>('test', {
      factory: () => 'factory-default',
    });

    const container = new Container();

    expect(container.get(token)).toBe('factory-default');
  });

  it('multiple useExisting with inheritance throws (class token pollution)', () => {
    @injectable()
    class ConfigA {
      get value() {
        return 'a';
      }
    }

    @injectable()
    class ConfigB extends ConfigA {
      override get value() {
        return 'b';
      }
    }

    const token = new InjectionToken<{ value: string }>('config', {
      factory: () => inject(ConfigA),
    });

    const container = new Container();
    container.bind({ provide: token, useExisting: ConfigB });
    container.bind({ provide: token, useExisting: ConfigA });

    // useExisting: ConfigB が ConfigA の class token にも暗黙bind → multi-value
    expect(() => container.get(token)).toThrow(/multiple values/);
  });

  it('multiple useExisting WITHOUT inheritance works (last wins)', () => {
    @injectable()
    class ConfigA {
      get value() {
        return 'a';
      }
    }

    @injectable()
    class ConfigB {
      get value() {
        return 'b';
      }
    }

    const token = new InjectionToken<{ value: string }>('config');

    const container = new Container();
    container.bind({ provide: token, useExisting: ConfigB });
    container.bind({ provide: token, useExisting: ConfigA });

    expect(container.get(token).value).toBe('a');
  });

  it('useFactory with inject() and inheritance still throws', () => {
    @injectable()
    class ConfigA {
      get value() {
        return 'a';
      }
    }

    @injectable()
    class ConfigB extends ConfigA {
      override get value() {
        return 'b';
      }
    }

    const token = new InjectionToken<{ value: string }>('config');

    const container = new Container();
    container.bind({ provide: token, useFactory: () => inject(ConfigB) });
    container.bind({ provide: token, useFactory: () => inject(ConfigA) });

    // inject(ConfigB) が ConfigA の class token を汚染するためエラー
    expect(() => container.get(token)).toThrow();
  });

  it('useFactory via singleToken is singleton', () => {
    @injectable()
    class MyConfig {
      value = 'hello';
    }

    const singleToken = new InjectionToken<MyConfig>('MyConfig:single');
    const token = new InjectionToken<MyConfig>('MyConfig');

    const container = new Container();
    container.bind({ provide: singleToken, useFactory: () => new MyConfig() });
    container.bind({ provide: token, useExisting: singleToken });

    const a = container.get(token);
    const b = container.get(token);
    expect(a).toBe(b);
  });

  it('useFactory via singleToken with override keeps singleton per token', () => {
    @injectable()
    class BaseConfig {
      get level() {
        return 'info';
      }
    }

    @injectable()
    class WarnConfig extends BaseConfig {
      override get level() {
        return 'warn';
      }
    }

    const singleBase = new InjectionToken<BaseConfig>('Base:single');
    const singleWarn = new InjectionToken<BaseConfig>('Warn:single');
    const token = new InjectionToken<BaseConfig>('config');

    const container = new Container();
    // default bind
    container.bind({ provide: singleBase, useFactory: () => new BaseConfig() });
    container.bind({ provide: token, useExisting: singleBase });
    // override
    container.bind({ provide: singleWarn, useFactory: () => new WarnConfig() });
    container.bind({ provide: token, useExisting: singleWarn });

    expect(container.get(token).level).toBe('warn');
    expect(container.get(token)).toBe(container.get(token));
  });

  it('useExisting class token with explicit bind works', () => {
    @injectable()
    class BaseConfig {
      get level() {
        return 'info';
      }
    }

    @injectable()
    class WarnConfig extends BaseConfig {
      override get level() {
        return 'warn';
      }
    }

    const container = new Container();
    container.bind({ provide: WarnConfig, useClass: WarnConfig });
    container.bind({ provide: BaseConfig, useExisting: WarnConfig });

    expect(container.get(BaseConfig).level).toBe('warn');
  });

  it('later useExisting wins over earlier useExisting', () => {
    @injectable()
    class ConfigA {
      get value() {
        return 'a';
      }
    }

    @injectable()
    class ConfigB {
      get value() {
        return 'b';
      }
    }

    const token = new InjectionToken<{ value: string }>('config', {
      factory: () => inject(ConfigA),
    });

    const container = new Container();
    container.bind({ provide: token, useExisting: ConfigA });
    container.bind({ provide: token, useExisting: ConfigB });

    expect(container.get(token).value).toBe('b');
  });
});
