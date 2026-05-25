import { createApp } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { ChainController } from '../src/chain.controller';
import { CounterService } from '../src/counter.service';
import { CounterAController } from '../src/counter-a.controller';
import { LeafService } from '../src/leaf.service';

const makeApp = () =>
  createApp({
    http: {
      controllers: [ChainController, CounterAController],
    },
  });

describe('Injector — per-app isolation', () => {
  afterAll(async () => {
    await shutdownAll();
  });

  it('each createApp() owns its own singleton instances', async () => {
    const app1 = await onTest(makeApp());
    const app2 = await onTest(makeApp());

    const leaf1 = app1.get(LeafService);
    const leaf2 = app2.get(LeafService);

    expect(leaf1).not.toBe(leaf2);
    expect(leaf1.value()).toBe('leaf');
    expect(leaf2.value()).toBe('leaf');
  });

  it('state mutations in one app do not leak to another', async () => {
    const app1 = await onTest(makeApp());
    const app2 = await onTest(makeApp());

    app1.get(CounterService).increment();
    app1.get(CounterService).increment();

    expect(app1.get(CounterService).value()).toBe(2);
    expect(app2.get(CounterService).value()).toBe(0);
  });
});
