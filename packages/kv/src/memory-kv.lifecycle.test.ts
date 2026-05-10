import { describe, expect, it, vi } from 'vitest';
import { LifecycleManager } from '@zeltjs/core';

import { MemoryKVDriver } from './memory-kv.driver';

describe('MemoryKVDriver Lifecycle', () => {
  it('implements Lifecycle interface', () => {
    const lifecycle = new LifecycleManager();
    const kv = new MemoryKVDriver(lifecycle);

    expect(typeof kv.startup).toBe('function');
    expect(typeof kv.shutdown).toBe('function');
  });

  it('registers itself with LifecycleManager', () => {
    const lifecycle = new LifecycleManager();
    const registerSpy = vi.spyOn(lifecycle, 'register');

    new MemoryKVDriver(lifecycle);

    expect(registerSpy).toHaveBeenCalledOnce();
  });
});
