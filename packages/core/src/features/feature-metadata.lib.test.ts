import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { attachFeatureClasses, hasFeature } from './feature-metadata.lib';
import { Feature } from './feature.types';

class TypedFeature extends Feature<'typed', { readonly value: () => string }> {
  readonly key = 'typed' as const;

  bind = vi.fn();
  staticCapabilities = () => ({});
  createCapabilities = () => ({ value: () => 'ok' });
}

class TypedFeatureChild extends TypedFeature {}

class OtherFeature extends Feature<'other', { readonly other: () => string }> {
  readonly key = 'other' as const;

  bind = vi.fn();
  staticCapabilities = () => ({});
  createCapabilities = () => ({ other: () => 'no' });
}

describe('feature metadata', () => {
  it('hasFeature narrows objects with attached feature class metadata', () => {
    const typedCaps: { readonly value: () => string } = { value: () => 'ok' };
    const app = attachFeatureClasses({ typed: typedCaps }, [new TypedFeature()]);

    expect(hasFeature(app, TypedFeature)).toBe(true);
    expect(hasFeature(app, OtherFeature)).toBe(false);

    if (hasFeature(app, TypedFeature)) {
      expectTypeOf(app.typed.value).toEqualTypeOf<() => string>();
      expect(app.typed.value()).toBe('ok');
    }
  });

  it('does not narrow static app-like objects to ready capabilities', () => {
    const app = attachFeatureClasses({ createRuntime: async () => ({}) }, [new TypedFeature()]);

    expect(hasFeature(app, TypedFeature)).toBe(true);

    if (hasFeature(app, TypedFeature)) {
      expectTypeOf(app).not.toHaveProperty('typed');
    }
  });

  it('can attach metadata more than once without throwing', () => {
    const app = attachFeatureClasses({}, [new TypedFeature()]);

    expect(() => attachFeatureClasses(app, [new TypedFeature()])).not.toThrow();
    expect(hasFeature(app, TypedFeature)).toBe(true);
  });

  it('matches subclasses through instanceof semantics', () => {
    const app = attachFeatureClasses({ typed: { value: () => 'ok' } }, [new TypedFeatureChild()]);

    expect(hasFeature(app, TypedFeature)).toBe(true);
  });
});
