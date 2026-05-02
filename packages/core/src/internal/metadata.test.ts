import { describe, expect, it } from 'vitest';

import {
  appendRouteMetadata,
  getControllerMetadata,
  getRouteMetadata,
  setControllerMetadata,
} from './metadata';

describe('metadata', () => {
  class A {}
  class B {}

  it('stores controller metadata per class', () => {
    setControllerMetadata(A, { basePath: '/users' });
    setControllerMetadata(B, { basePath: '/posts' });
    expect(getControllerMetadata(A)).toEqual({ basePath: '/users' });
    expect(getControllerMetadata(B)).toEqual({ basePath: '/posts' });
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
