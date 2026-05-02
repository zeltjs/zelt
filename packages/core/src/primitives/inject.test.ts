import { Container, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { inject } from './inject';

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

describe('inject (re-export)', () => {
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
    // 非 @injectable() class は needle-di の auto-bind 対象外なので、bind しなければ確実に throw する
    class NotBound {}

    @injectable()
    class Orphan {
      constructor(public dep = inject(NotBound)) {}
    }
    const container = new Container();
    container.bind(Orphan); // NotBound は bind しない
    expect(() => container.get(Orphan)).toThrow();
  });
});
