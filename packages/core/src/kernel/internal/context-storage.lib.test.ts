import { describe, expect, it } from 'vitest';

import { createContextStorage } from './context-storage.lib';

describe('createContextStorage', () => {
  it('returns undefined outside a context', () => {
    const storage = createContextStorage<string>('test:outside');

    expect(storage.get()).toBeUndefined();
  });

  it('propagates a value across an asynchronous boundary', async () => {
    const storage = createContextStorage<string>('test:async');

    const value = await storage.run('inside', async () => {
      await Promise.resolve();
      return storage.get();
    });

    expect(value).toBe('inside');
    expect(storage.get()).toBeUndefined();
  });

  it('isolates concurrent values', async () => {
    const storage = createContextStorage<string>('test:concurrent');

    const [a, b] = await Promise.all([
      storage.run('A', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return storage.get();
      }),
      storage.run('B', async () => storage.get()),
    ]);

    expect([a, b]).toEqual(['A', 'B']);
  });

  it('restores a parent value after a nested run', () => {
    const storage = createContextStorage<string>('test:nested');

    storage.run('outer', () => {
      storage.run('inner', () => expect(storage.get()).toBe('inner'));
      expect(storage.get()).toBe('outer');
    });
  });

  it('isolates different storage keys', () => {
    const first = createContextStorage<string>('test:first');
    const second = createContextStorage<number>('test:second');

    first.run('value', () => {
      second.run(42, () => {
        expect(first.get()).toBe('value');
        expect(second.get()).toBe(42);
      });
    });
  });
});
