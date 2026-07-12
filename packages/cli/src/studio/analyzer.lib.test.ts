import { describe, expect, it } from 'vitest';

import {
  extractDecoratorNames,
  extractMiddlewareRefs,
  extractRoutes,
  isAppLike,
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

  it('unwraps options-style entries and lets class-level absorb method-level', () => {
    const meta = {
      props: [
        { decorator: 'UseMiddleware', middlewares: [{ middleware: MwA, options: { x: 1 } }] },
      ],
      methods: [{ name: 'list', props: [{ decorator: 'UseMiddleware', middlewares: [MwA] }] }],
    };
    // class-level 適用があれば全メソッドに効くため methods は持たない
    expect(extractMiddlewareRefs(meta)).toEqual([{ middleware: MwA }]);
  });
});
