import { describe, expect, it, vi } from 'vitest';
import { LifecycleManager } from '@zeltjs/core';

import { MemoryKV } from './memory-kv';

describe('MemoryKV Lifecycle', () => {
  it('implements Lifecycle interface', () => {
    const lifecycle = new LifecycleManager();
    const kv = new MemoryKV(lifecycle);

    expect(typeof kv.startup).toBe('function');
    expect(typeof kv.shutdown).toBe('function');
  });

  it('registers itself with LifecycleManager', () => {
    const lifecycle = new LifecycleManager();
    const registerSpy = vi.spyOn(lifecycle, 'register');

    new MemoryKV(lifecycle);

    expect(registerSpy).toHaveBeenCalledOnce();
  });
});
