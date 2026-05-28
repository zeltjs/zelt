import { LifecycleManager } from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';

import { MemoryKVAdaptor } from './adaptor-memory';
import { KVUtilService } from './util';

describe('MemoryKVAdaptor Lifecycle', () => {
  it('implements Lifecycle interface', () => {
    const util = new KVUtilService();
    const lifecycle = new LifecycleManager();
    const kv = new MemoryKVAdaptor(util, lifecycle);

    expect(typeof kv.startup).toBe('function');
    expect(typeof kv.shutdown).toBe('function');
  });

  it('registers itself with LifecycleManager', () => {
    const util = new KVUtilService();
    const lifecycle = new LifecycleManager();
    const registerSpy = vi.spyOn(lifecycle, 'register');

    new MemoryKVAdaptor(util, lifecycle);

    expect(registerSpy).toHaveBeenCalledOnce();
  });
});
