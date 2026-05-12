import { describe, expect, it } from 'vitest';

import {
  appendPendingAuthorizedMetadata,
  appendPendingMethodMiddlewareMetadata,
  appendPendingRouteMetadata,
  appendPendingSkipMiddlewareMetadata,
  appendRouteMetadata,
  getAuthorizedMetadata,
  getControllerMetadata,
  getMethodMiddlewareMetadata,
  getRouteMetadata,
  getSkipMiddlewareMetadata,
  resolveAuthorizedMetadata,
  resolveMethodMiddlewareMetadata,
  resolveRouteMetadata,
  resolveSkipMiddlewareMetadata,
  setControllerMetadata,
} from './metadata';

describe('metadata', () => {
  class A {}
  class B {}

  it('stores controller metadata per class', () => {
    setControllerMetadata(A, { basePath: '/users', sourceFile: undefined });
    setControllerMetadata(B, { basePath: '/posts', sourceFile: undefined });
    expect(getControllerMetadata(A)?.basePath).toBe('/users');
    expect(getControllerMetadata(B)?.basePath).toBe('/posts');
  });

  it('returns undefined for unknown class', () => {
    class C {}
    expect(getControllerMetadata(C)).toBeUndefined();
  });

  it('appends route metadata in declaration order', () => {
    class D {}
    appendRouteMetadata(D, { method: 'GET', path: '/', methodName: 'list' });
    appendRouteMetadata(D, { method: 'POST', path: '/', methodName: 'create' });
    expect(getRouteMetadata(D)).toEqual([
      { method: 'GET', path: '/', methodName: 'list' },
      { method: 'POST', path: '/', methodName: 'create' },
    ]);
  });

  it('dedupes duplicate route metadata (safety net for repeated registrations)', () => {
    class E {}
    appendRouteMetadata(E, { method: 'GET', path: '/', methodName: 'list' });
    appendRouteMetadata(E, { method: 'GET', path: '/', methodName: 'list' });
    expect(getRouteMetadata(E)).toHaveLength(1);
  });
});

describe('pending/resolve pattern', () => {
  describe('route metadata', () => {
    it('stores to pending and resolves to final', () => {
      const pendingKey = {};
      class TestClass {}
      const meta = { method: 'GET' as const, path: '/test', methodName: 'test' };

      appendPendingRouteMetadata(pendingKey, meta);
      resolveRouteMetadata(pendingKey, TestClass);

      const result = getRouteMetadata(TestClass);
      expect(result).toEqual([meta]);
    });

    it('handles multiple routes on same pending key', () => {
      const pendingKey = {};
      class TestClass {}
      const meta1 = { method: 'GET' as const, path: '/a', methodName: 'a' };
      const meta2 = { method: 'POST' as const, path: '/b', methodName: 'b' };

      appendPendingRouteMetadata(pendingKey, meta1);
      appendPendingRouteMetadata(pendingKey, meta2);
      resolveRouteMetadata(pendingKey, TestClass);

      const result = getRouteMetadata(TestClass);
      expect(result).toEqual([meta1, meta2]);
    });
  });

  describe('method middleware metadata', () => {
    it('stores to pending and resolves to final', () => {
      const pendingKey = {};
      class TestClass {}
      class MiddlewareA {
        async use() {
          return undefined;
        }
      }

      appendPendingMethodMiddlewareMetadata(pendingKey, 'test', [MiddlewareA]);
      resolveMethodMiddlewareMetadata(pendingKey, TestClass);

      const result = getMethodMiddlewareMetadata(TestClass);
      expect(result).toEqual([{ methodName: 'test', middlewares: [MiddlewareA] }]);
    });
  });

  describe('skip middleware metadata', () => {
    it('stores to pending and resolves to final', () => {
      const pendingKey = {};
      class TestClass {}
      class MiddlewareA {
        async use() {
          return undefined;
        }
      }

      appendPendingSkipMiddlewareMetadata(pendingKey, 'test', [MiddlewareA]);
      resolveSkipMiddlewareMetadata(pendingKey, TestClass);

      const result = getSkipMiddlewareMetadata(TestClass);
      expect(result).toEqual([{ methodName: 'test', skipped: [MiddlewareA] }]);
    });
  });

  describe('authorized metadata', () => {
    it('stores to pending and resolves to final', () => {
      const pendingKey = {};
      class TestClass {}

      appendPendingAuthorizedMetadata(pendingKey, 'test', ['admin']);
      resolveAuthorizedMetadata(pendingKey, TestClass);

      const result = getAuthorizedMetadata(TestClass, 'test');
      expect(result).toEqual({ methodName: 'test', roles: ['admin'] });
    });
  });
});
