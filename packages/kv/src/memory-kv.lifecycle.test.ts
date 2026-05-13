import { LifecycleManager } from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';

import { MemoryKVAdaptor } from './adaptor-memory';

describe('MemoryKVAdaptor Lifecycle', () => {
  it('implements Lifecycle interface', () => {
    const lifecycle = new LifecycleManager();
    const kv = new MemoryKVAdaptor(lifecycle);

    expect(typeof kv.startup).toBe('function');
    expect(typeof kv.shutdown).toBe('function');
  });

  it('registers itself with LifecycleManager', () => {
    const lifecycle = new LifecycleManager();
    const registerSpy = vi.spyOn(lifecycle, 'register');

    new MemoryKVAdaptor(lifecycle);

    expect(registerSpy).toHaveBeenCalledOnce();
  });
});
