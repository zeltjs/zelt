import { describe, expect, it } from 'vitest';

import { runInContext } from '../../../../kernel/internal';

import { getContext, setContext } from './get-context.lib';

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    nonexistent: unknown;
  }
}

describe('getContext', () => {
  it('returns value set via setContext', () => {
    runInContext(() => {
      setContext('user', { id: 1, name: 'alice' });
      expect(getContext('user')).toEqual({ id: 1, name: 'alice' });
    });
  });

  it('returns undefined when key is not set', () => {
    runInContext(() => {
      expect(getContext('nonexistent')).toBeUndefined();
    });
  });

  it('throws when called outside entry context', () => {
    expect(() => getContext('nonexistent')).toThrow(/outside entry execution/);
  });
});

describe('setContext', () => {
  it('stores value retrievable by getContext', () => {
    runInContext(() => {
      setContext('user', { id: 1, name: 'alice' });
      expect(getContext('user')).toEqual({ id: 1, name: 'alice' });
    });
  });

  it('throws when called outside entry context', () => {
    expect(() => setContext('user', { id: 1, name: 'test' })).toThrow(/outside entry execution/);
  });
});
