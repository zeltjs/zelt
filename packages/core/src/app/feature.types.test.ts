import { describe, expectTypeOf, it } from 'vitest';

import type {
  ConfiguredFeature,
  FeatureEntry,
  NamespacedCaps,
  StaticNamespacedCaps,
} from './index';

type MockHttpReadyCaps = { readonly fetch: (req: Request) => Promise<Response> };
type MockHttpStaticCaps = { readonly getMetadata: () => object };
type MockHttpFeature = ConfiguredFeature<'http', MockHttpReadyCaps, MockHttpStaticCaps>;
// biome-ignore lint/complexity/noBannedTypes: intentional empty caps for testing namespace preservation
type MockEmptyCaps = {};
type MockEmptyFeature = ConfiguredFeature<'background', MockEmptyCaps>;

describe('Feature type utilities', () => {
  it('NamespacedCaps maps feature key to ready caps', () => {
    type Result = NamespacedCaps<readonly [MockHttpFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly http: MockHttpReadyCaps }>();
  });

  it('NamespacedCaps preserves features with empty caps', () => {
    type Result = NamespacedCaps<readonly [MockHttpFeature, MockEmptyFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly http: MockHttpReadyCaps;
      readonly background: MockEmptyCaps;
    }>();
  });

  it('NamespacedCaps merges multiple features', () => {
    type MockSchedulerCaps = { readonly start: () => void };
    type MockSchedulerFeature = ConfiguredFeature<'scheduler', MockSchedulerCaps>;
    type Result = NamespacedCaps<readonly [MockHttpFeature, MockSchedulerFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly http: MockHttpReadyCaps;
      readonly scheduler: MockSchedulerCaps;
    }>();
  });

  it('StaticNamespacedCaps maps feature key to static caps', () => {
    type Result = StaticNamespacedCaps<readonly [MockHttpFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly http: MockHttpStaticCaps }>();
  });

  it('StaticNamespacedCaps omits features without blueprint', () => {
    type MockSchedulerCaps = { readonly start: () => void };
    type MockSchedulerFeature = ConfiguredFeature<'scheduler', MockSchedulerCaps>;
    type Result = StaticNamespacedCaps<readonly [MockHttpFeature, MockSchedulerFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly http: MockHttpStaticCaps }>();
  });

  it('FeatureEntry preserves feature key and ready capabilities', () => {
    type Result = FeatureEntry<MockHttpFeature>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly key: MockHttpFeature['key'];
      readonly feature: MockHttpFeature;
      readonly capabilities: MockHttpReadyCaps;
    }>();
  });
});
