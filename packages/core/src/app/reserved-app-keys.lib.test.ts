import { describe, expect, expectTypeOf, it } from 'vitest';

import { http, httpServer } from '../features';
import { ZeltAppConfigurationError } from '../kernel';
import { createApp } from './create-app.lib';
import type { ConfiguredFeature } from './feature.types';
import type { ReservedAppKey, ReservedAppProperties } from './reserved-app-keys.lib';
import { RESERVED_APP_KEYS } from './reserved-app-keys.lib';

const assertReservedNames = (name: ReservedAppKey): void => {
  // @ts-expect-error reserved names cannot be used by HTTP features
  http({ name });
  // @ts-expect-error reserved names cannot be used by HTTP server features
  httpServer({ name });
  const feature: ConfiguredFeature<ReservedAppKey> = {
    key: name,
    featureClasses: () => [],
    blueprint: () => ({}),
    realize: () => ({}),
  };
  // @ts-expect-error custom features cannot bypass the reserved names
  createApp([feature]);
};
void assertReservedNames;

const assertLiteralNames = (name: 'public' | 'args'): void => {
  // @ts-expect-error literal reserved names must not widen to string during inference
  http({ name: 'args' });
  // @ts-expect-error a union containing a reserved name is not a valid feature name
  http({ name });
  const options = { name: 'args' as const, controllers: [] };
  // @ts-expect-error named options must not match the unnamed HTTP overload
  http(options);
  const optionalOptions: { readonly name?: 'public' | 'args' } = { name };
  // @ts-expect-error optional names must not hide a reserved name in their union
  http(optionalOptions);
  createApp([
    // @ts-expect-error reserved names cannot be introduced through an object literal
    { key: 'shutdown', featureClasses: () => [], blueprint: () => ({}), realize: () => ({}) },
  ]);
};
void assertLiteralNames;

const assertReservedProperties = (): void => {
  type Environment = ReservedAppProperties<{ readonly args: readonly string[] }>;
  expectTypeOf<Environment['args']>().toEqualTypeOf<readonly string[]>();
  // @ts-expect-error unlisted properties cannot be added to the built-in app API
  type UnlistedProperty = ReservedAppProperties<{ readonly unlisted: string }>;
  // @ts-expect-error unlisted methods cannot be added to the built-in app API
  type UnlistedMethod = ReservedAppProperties<{ unlisted(): void }>;
  expectTypeOf<UnlistedProperty>().toHaveProperty('unlisted');
  expectTypeOf<UnlistedMethod>().toHaveProperty('unlisted');
};
void assertReservedProperties;

describe('reserved app keys', () => {
  it.each(
    RESERVED_APP_KEYS,
  )('rejects the reserved name %s before feature initialization', (key) => {
    let initialized = false;
    const feature: ConfiguredFeature = {
      key,
      featureClasses: () => [],
      blueprint: () => {
        initialized = true;
        return {};
      },
      realize: () => ({}),
    };
    expect(() => createApp([feature])).toThrow(ZeltAppConfigurationError);
    expect(initialized).toBe(false);
  });

  it('preserves named features, custom capabilities, and empty apps', async () => {
    const custom = {
      key: 'custom' as const,
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: () => ({ value: () => 42 }),
    };
    expectTypeOf(httpServer({ name: 'listener' }).key).toEqualTypeOf<'listener'>();
    const options = { name: 'public' as const };
    const app = createApp([http(options), custom]);
    const runtime = await app.createRuntime();
    try {
      expectTypeOf(runtime.custom.value()).toEqualTypeOf<number>();
      expectTypeOf(runtime.public.fetch).toBeFunction();
      expect(runtime.custom.value()).toBe(42);
      expect((await runtime.public.request('/')).status).toBe(404);
    } finally {
      await runtime.shutdown();
    }
    const empty = await createApp([]).createRuntime();
    await empty.shutdown();
  });
});
