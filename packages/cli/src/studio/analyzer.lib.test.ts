import { describe, expect, it } from 'vitest';

import {
  extractDecoratorNames,
  extractMiddlewareRefs,
  extractRoutes,
  isAppLike,
  propsAppliesMiddleware,
  toPosixPath,
} from './analyzer.lib';

describe('isAppLike', () => {
  it('accepts an object with a features array', () => {
    expect(isAppLike({ features: [] })).toBe(true);
  });

  it.each([null, undefined, 42, {}, { features: 'not-array' }])('rejects %j', (value) => {
    expect(isAppLike(value)).toBe(false);
  });
});

describe('extractDecoratorNames', () => {
  it('collects decorator names from metadata props', () => {
    expect(
      extractDecoratorNames([{ decorator: 'Controller', basePath: '/x' }, { other: 1 }]),
    ).toEqual(['Controller']);
  });

  it('returns empty array for props without decorator field', () => {
    expect(extractDecoratorNames([])).toEqual([]);
  });
});

class MwA {}
class MwB {}

describe('extractRoutes', () => {
  it('joins basePath with route paths', () => {
    const meta = {
      props: [{ decorator: 'Controller', basePath: '/users' }],
      methods: [
        { name: 'list', props: [{ decorator: 'Route', method: 'GET', path: '/' }] },
        { name: 'create', props: [{ decorator: 'Route', method: 'POST', path: '/new' }] },
        { name: 'helper', props: [{ decorator: 'Authorized', roles: [] }] },
      ],
    };
    expect(extractRoutes(meta)).toEqual([
      { method: 'GET', path: '/users', handler: 'list' },
      { method: 'POST', path: '/users/new', handler: 'create' },
    ]);
  });

  it('defaults basePath to / when Controller props are missing', () => {
    const meta = {
      props: [],
      methods: [{ name: 'get', props: [{ decorator: 'Route', method: 'GET', path: '/x' }] }],
    };
    expect(extractRoutes(meta)).toEqual([{ method: 'GET', path: '/x', handler: 'get' }]);
  });

  // core の getRouteMetadata と同じく重複 metadata を除外する（React key 衝突・重複JSON防止）
  it('dedups duplicated route metadata', () => {
    const meta = {
      props: [],
      methods: [
        {
          name: 'get',
          props: [
            { decorator: 'Route', method: 'GET', path: '/x' },
            { decorator: 'Route', method: 'GET', path: '/x' },
          ],
        },
      ],
    };
    expect(extractRoutes(meta)).toEqual([{ method: 'GET', path: '/x', handler: 'get' }]);
  });
});

describe('extractMiddlewareRefs', () => {
  it('collects class-level and method-level applications separately', () => {
    const meta = {
      props: [{ decorator: 'UseMiddleware', middlewares: [MwA] }],
      methods: [
        { name: 'list', props: [{ decorator: 'UseMiddleware', middlewares: [MwB] }] },
        { name: 'create', props: [{ decorator: 'UseMiddleware', middlewares: [MwB] }] },
      ],
    };
    expect(extractMiddlewareRefs(meta)).toEqual([
      { middleware: MwA },
      { middleware: MwB, methods: ['list', 'create'] },
    ]);
  });

  // レビュー指摘6: class-level 適用と method-level 適用は別々の occurrence であり、
  // 同じ middleware であっても一方が他方を吸収して握り潰してはならない(以前は
  // 「class-level に既にあれば method-level occurrence を作らない」という誤った仕様だった)
  it('keeps a class-level application and a method-level application of the same middleware as two distinct occurrences (unwrapping options-style entries)', () => {
    const meta = {
      props: [
        { decorator: 'UseMiddleware', middlewares: [{ middleware: MwA, options: { x: 1 } }] },
      ],
      methods: [{ name: 'list', props: [{ decorator: 'UseMiddleware', middlewares: [MwA] }] }],
    };
    expect(extractMiddlewareRefs(meta)).toEqual([
      { middleware: MwA },
      { middleware: MwA, methods: ['list'] },
    ]);
  });

  // レビュー指摘6: 同じメソッドへの同じ middleware の2回の適用も、それぞれ別の occurrence
  // として保持する(以前は2回目以降を includes() で無視していた)
  it('keeps two applications of the same middleware on the same method as two occurrences', () => {
    const meta = {
      props: [],
      methods: [
        {
          name: 'handle',
          props: [
            { decorator: 'UseMiddleware', middlewares: [MwA] },
            { decorator: 'UseMiddleware', middlewares: [MwA] },
          ],
        },
      ],
    };
    expect(extractMiddlewareRefs(meta)).toEqual([
      { middleware: MwA, methods: ['handle', 'handle'] },
    ]);
  });
});

describe('propsAppliesMiddleware', () => {
  it('matches a UseMiddleware props entry referencing the given class', () => {
    expect(propsAppliesMiddleware({ decorator: 'UseMiddleware', middlewares: [MwA] }, MwA)).toBe(
      true,
    );
  });

  it('matches an options-style entry ({ middleware, options })', () => {
    expect(
      propsAppliesMiddleware(
        { decorator: 'UseMiddleware', middlewares: [{ middleware: MwA, options: { x: 1 } }] },
        MwA,
      ),
    ).toBe(true);
  });

  it('does not match a different middleware class', () => {
    expect(propsAppliesMiddleware({ decorator: 'UseMiddleware', middlewares: [MwA] }, MwB)).toBe(
      false,
    );
  });

  it('does not match a non-UseMiddleware decorator (e.g. @RateLimit itself, which has no class-reference args)', () => {
    expect(propsAppliesMiddleware({ decorator: 'RateLimit', options: { limit: 3 } }, MwA)).toBe(
      false,
    );
  });
});

describe('toPosixPath', () => {
  it('converts backslash separators to forward slashes', () => {
    expect(toPosixPath('src\\studio\\analyzer.lib.ts')).toBe('src/studio/analyzer.lib.ts');
  });

  it('leaves posix paths unchanged', () => {
    expect(toPosixPath('src/studio/analyzer.lib.ts')).toBe('src/studio/analyzer.lib.ts');
  });
});
