import { Container, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { registerAsLeaf } from './leaf.lib';
import { resolve } from './resolve.lib';
import { registerAsTransient } from './transient.lib';

describe('resolve', () => {
  it('resolves leaf class via getLeaf', () => {
    @injectable()
    class LeafConfig {
      value = 'leaf';
    }
    registerAsLeaf(LeafConfig);

    const container = new Container();
    const instance1 = resolve(container, LeafConfig);
    const instance2 = resolve(container, LeafConfig);

    expect(instance1).toBe(instance2);
    expect(instance1.value).toBe('leaf');
  });

  it('resolves transient class via getTransient', () => {
    @injectable()
    class TransientCmd {}
    registerAsTransient(TransientCmd);

    const container = new Container();
    const instance1 = resolve(container, TransientCmd);
    const instance2 = resolve(container, TransientCmd);

    expect(instance1).not.toBe(instance2);
  });

  it('resolves regular class via container.get (singleton)', () => {
    @injectable()
    class RegularService {}

    const container = new Container();
    const instance1 = resolve(container, RegularService);
    const instance2 = resolve(container, RegularService);

    expect(instance1).toBe(instance2);
  });

  it('prioritizes leaf over transient if both registered', () => {
    @injectable()
    class DualRegistered {}
    registerAsLeaf(DualRegistered);
    registerAsTransient(DualRegistered);

    const container = new Container();
    const instance1 = resolve(container, DualRegistered);
    const instance2 = resolve(container, DualRegistered);

    // Leaf wins, so singleton behavior
    expect(instance1).toBe(instance2);
  });
});
