import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { ConfiguredFeature } from '../features/feature.types';
import type { RuntimeApp } from './create-app.lib';
import { createApp } from './create-app.lib';

const createStubFeature = <TKey extends string, TCaps extends object>(
  key: TKey,
  caps: TCaps,
): ConfiguredFeature<TKey, TCaps> => ({
  key,
  bind: vi.fn(),
  staticCapabilities: () => ({}),
  createCapabilities: () => caps,
});

const createEmptyFeature = (key: string): ConfiguredFeature<string, object> => ({
  key,
  bind: vi.fn(),
  staticCapabilities: () => ({}),
  createCapabilities: () => ({}),
});

describe('createApp', () => {
  it('returns an App with createRuntime() method', () => {
    const app = createApp([createEmptyFeature('stub')]);
    expect(typeof app.createRuntime).toBe('function');
  });

  it('createRuntime() returns RuntimeApp with get and shutdown', async () => {
    const app = createApp([createEmptyFeature('stub')]);
    const readyApp = await app.createRuntime();
    expect(typeof readyApp.get).toBe('function');
    expect(typeof readyApp.shutdown).toBe('function');
    await readyApp.shutdown();
  });

  it('createRuntime() exposes namespaced caps from features', async () => {
    const caps = { greet: () => 'hello' };
    const app = createApp([createStubFeature('test', caps)]);
    const readyApp = await app.createRuntime();

    expect(readyApp.test.greet()).toBe('hello');
    await readyApp.shutdown();
  });

  it('empty caps features appear on RuntimeApp', async () => {
    const app = createApp([createEmptyFeature('empty')]);
    const readyApp = await app.createRuntime();

    expect('empty' in readyApp).toBe(true);
    await readyApp.shutdown();
  });

  it('each createRuntime() creates an independent instance', async () => {
    const app = createApp([createStubFeature('test', { value: 1 })]);
    const a = await app.createRuntime();
    const b = await app.createRuntime();

    expect(a).not.toBe(b);

    await a.shutdown();
    await b.shutdown();
  });

  it('createRuntime() accepts config overrides', async () => {
    const app = createApp([createEmptyFeature('stub')]);
    const readyApp = await app.createRuntime({ configs: [] });
    expect(typeof readyApp.get).toBe('function');
    await readyApp.shutdown();
  });

  it('caps are correctly namespaced in types', () => {
    type StubFeature = ConfiguredFeature<'myns', { doSomething: () => void }>;
    type Result = RuntimeApp<readonly [StubFeature]>;
    expectTypeOf<Result>().toHaveProperty('myns');
    expectTypeOf<Result>().toHaveProperty('get');
    expectTypeOf<Result>().toHaveProperty('shutdown');
  });

  it('empty caps features appear on RuntimeApp type', () => {
    type EmptyFeature = ConfiguredFeature<'empty', object>;
    type Result = RuntimeApp<readonly [EmptyFeature]>;
    expectTypeOf<Result>().toHaveProperty('get');
    expectTypeOf<Result>().toHaveProperty('shutdown');
    expectTypeOf<Result>().toHaveProperty('empty');
  });
});
