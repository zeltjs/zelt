import { describe, expect, it } from 'vitest';

import {
  captureContext,
  createContextKey,
  createContextScope,
  getInternal,
  setInternal,
} from './context-key.lib';
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

  it.each([
    'sync',
    'async',
  ] as const)('shares entry updates through a %s storage scope', async (mode) => {
    const storage = createContextStorage<string>('test:shared-entry');
    const key = createContextKey<string>('test:entry-value');
    await createContextScope({ mode, inherit: false }).run(async () => {
      const entry = captureContext();
      await storage.run('scoped', async () => {
        const scoped = captureContext();
        setInternal(key, 'first');
        expect(entry.run(() => getInternal(key))).toBe('first');
        expect(entry.run(storage.get)).toBeUndefined();
        await Promise.resolve();
        scoped.run(() => setInternal(key, 'updated'));
      });
      expect(entry.run(() => getInternal(key))).toBe('updated');
      expect(entry.run(storage.get)).toBeUndefined();
    });
  });

  it.each([
    'sync',
    'async',
  ] as const)('restores scoped values after rejection in %s mode', async (mode) => {
    const storage = createContextStorage<string>('test:rejected');
    const failure = new Error('scope failure');
    await createContextScope({ mode, inherit: false }).run(() =>
      storage.run('outer', async () => {
        const outer = captureContext();
        await expect(
          storage.run('inner', async () => {
            await Promise.resolve();
            throw failure;
          }),
        ).rejects.toBe(failure);
        expect(outer.run(storage.get)).toBe('outer');
      }),
    );
    expect(storage.get()).toBeUndefined();
  });

  it('inherits scoped values for derived entries and clears them for independent roots', () => {
    const storage = createContextStorage<string>('test:inherit');
    storage.run('outer', () => {
      createContextScope({ inherit: true }).run(() => expect(storage.get()).toBe('outer'));
      createContextScope({ inherit: false }).run(() => expect(storage.get()).toBeUndefined());
      expect(storage.get()).toBe('outer');
    });
  });
});
