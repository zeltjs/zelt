import { describe, expect, it } from 'vitest';
import { createContextKey, createContextScope, getInternal, setInternal } from './context-key.lib';

describe('context mode isolation', () => {
  it('masks an enclosing async scope during a suspended sync scope', async () => {
    const key = createContextKey<string>('mode-isolation');
    await createContextScope({ mode: 'async' }).run(async () => {
      setInternal(key, 'outer');
      const inner = createContextScope({ mode: 'sync', inherit: false });
      await inner.run(async () => {
        setInternal(key, 'inner');
        await Promise.resolve();
        expect(() => getInternal(key)).toThrow(/outside entry execution/);
        expect(inner.run(() => getInternal(key))).toBe('inner');
      });
      expect(getInternal(key)).toBe('outer');
    });
  });

  it('does not inherit values when a scope is explicitly rooted', () => {
    const key = createContextKey<string>('root-isolation');
    createContextScope({ mode: 'sync' }).run(() => {
      setInternal(key, 'outer');
      createContextScope({ mode: 'sync', inherit: false }).run(() => {
        expect(getInternal(key)).toBeUndefined();
      });
      expect(getInternal(key)).toBe('outer');
    });
  });
});
