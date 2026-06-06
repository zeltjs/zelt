import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { Feature, hasFeature } from '../features';
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

class TypedFeature extends Feature<'typed', { readonly value: () => string }> {
  readonly key = 'typed' as const;

  bind = vi.fn();
  staticCapabilities = () => ({});
  createCapabilities = () => ({ value: () => 'ok' });
}

class UserFeature extends Feature<'userFeature', { readonly run: () => number }> {
  readonly key = 'userFeature' as const;

  bind = vi.fn();
  staticCapabilities = () => ({});
  createCapabilities = () => ({ run: () => 123 });
}

class OtherFeature extends Feature<'otherFeature', { readonly other: () => string }> {
  readonly key = 'otherFeature' as const;

  bind = vi.fn();
  staticCapabilities = () => ({});
  createCapabilities = () => ({ other: () => 'no' });
}

const duplicateStaticCapabilities = vi.fn(() => ({}));

class DuplicateA extends Feature<'dup', { readonly a: () => string }> {
  readonly key = 'dup' as const;
  bind = vi.fn();
  staticCapabilities = duplicateStaticCapabilities;
  createCapabilities = () => ({ a: () => 'a' });
}

class DuplicateB extends Feature<'dup', { readonly b: () => string }> {
  readonly key = 'dup' as const;
  bind = vi.fn();
  staticCapabilities = () => ({});
  createCapabilities = () => ({ b: () => 'b' });
}

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

  it('hasFeature works on static App before createRuntime', () => {
    const app = createApp([new TypedFeature()]);

    expect(hasFeature(app, TypedFeature)).toBe(true);

    if (hasFeature(app, TypedFeature)) {
      expectTypeOf(app).toHaveProperty('createRuntime');
      expectTypeOf(app).not.toHaveProperty('typed');
    }
  });

  it('hasFeature narrows RuntimeApp by feature class', async () => {
    const app = createApp([new TypedFeature()]);
    const readyApp = await app.createRuntime();

    expect(hasFeature(readyApp, TypedFeature)).toBe(true);

    if (hasFeature(readyApp, TypedFeature)) {
      expectTypeOf(readyApp.typed.value).toEqualTypeOf<() => string>();
      expect(readyApp.typed.value()).toBe('ok');
    }

    await readyApp.shutdown();
  });

  it('hasFeature supports user-defined feature classes without key tokens', async () => {
    const app = createApp([new UserFeature()]);
    const readyApp = await app.createRuntime();

    expect(hasFeature(readyApp, UserFeature)).toBe(true);
    expect(hasFeature(readyApp, OtherFeature)).toBe(false);

    if (hasFeature(readyApp, UserFeature)) {
      expectTypeOf(readyApp.userFeature.run).toEqualTypeOf<() => number>();
      expect(readyApp.userFeature.run()).toBe(123);
    }

    await readyApp.shutdown();
  });

  it('rejects duplicate feature keys', () => {
    duplicateStaticCapabilities.mockClear();

    expect(() => createApp([new DuplicateA(), new DuplicateB()])).toThrow(
      /Duplicate feature key: dup/,
    );
    expect(duplicateStaticCapabilities).not.toHaveBeenCalled();
  });
});
