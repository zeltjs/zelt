import { Container, InjectionToken, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { inject } from './inject.lib';
import { overrideLeaf, registerAsLeaf } from './leaf.lib';
import { registerAsTransient } from './transient.lib';

@injectable()
class Service {
  hello() {
    return 'world';
  }
}

@injectable()
class Consumer {
  constructor(private readonly service = inject(Service)) {}
  greet() {
    return this.service.hello();
  }
}

describe('inject (unified)', () => {
  it('resolves a constructor default through container.get', () => {
    const container = new Container();
    container.bind(Service);
    container.bind(Consumer);
    expect(container.get(Consumer).greet()).toBe('world');
  });

  it('shares the same instance per Application scope (singleton by default)', () => {
    const container = new Container();
    container.bind(Service);
    container.bind(Consumer);
    expect(container.get(Consumer)).toBe(container.get(Consumer));
  });

  it('throws when token is not bound', () => {
    class NotBound {}

    @injectable()
    class Orphan {
      constructor(public dep = inject(NotBound)) {}
    }
    const container = new Container();
    container.bind(Orphan);
    expect(() => container.get(Orphan)).toThrow();
  });

  describe('leaf class resolution', () => {
    it('inject(@leaf class) resolves via leaf mechanism', () => {
      @injectable()
      class BaseConfig {
        get value() {
          return 'base';
        }
      }
      registerAsLeaf(BaseConfig);

      @injectable()
      class ChildConfig extends BaseConfig {
        override get value() {
          return 'child';
        }
      }
      registerAsLeaf(ChildConfig);

      @injectable()
      class ServiceUsingConfig {
        constructor(public config = inject(BaseConfig)) {}
      }

      const container = new Container();
      overrideLeaf(container, ChildConfig);
      container.bind(ServiceUsingConfig);

      expect(container.get(ServiceUsingConfig).config.value).toBe('child');
    });

    it('inject(regular class) delegates to needle-di', () => {
      @injectable()
      class RegularService {
        get name() {
          return 'regular';
        }
      }

      @injectable()
      class RegularConsumer {
        constructor(public svc = inject(RegularService)) {}
      }

      const container = new Container();
      container.bind(RegularService);
      container.bind(RegularConsumer);

      expect(container.get(RegularConsumer).svc.name).toBe('regular');
    });

    it('inject(InjectionToken) delegates to needle-di', () => {
      const TOKEN = new InjectionToken<string>('test-token');

      @injectable()
      class TokenConsumer {
        constructor(public value = inject(TOKEN)) {}
      }

      const container = new Container();
      container.bind({ provide: TOKEN, useValue: 'token-value' });
      container.bind(TokenConsumer);

      expect(container.get(TokenConsumer).value).toBe('token-value');
    });
  });
});

describe('inject with transient', () => {
  it('injects transient class as new instance each time', () => {
    @injectable()
    class TransientDep {}
    registerAsTransient(TransientDep);

    @injectable()
    class Consumer {
      dep1: TransientDep = inject(TransientDep);
      dep2: TransientDep = inject(TransientDep);
    }

    const container = new Container();
    const consumer = container.get(Consumer);

    expect(consumer.dep1).not.toBe(consumer.dep2);
  });
});
