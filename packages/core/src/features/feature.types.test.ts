import { describe, expectTypeOf, it } from 'vitest';

import type { ConfiguredFeature, ExtractCaps, NamespacedCaps } from './feature.types';

type MockHttpCaps = { readonly fetch: (req: Request) => Promise<Response> };
type MockHttpFeature = ConfiguredFeature<'http', MockHttpCaps>;
// biome-ignore lint/complexity/noBannedTypes: intentional empty caps for testing namespace preservation
type MockEmptyCaps = {};
type MockEmptyFeature = ConfiguredFeature<'background', MockEmptyCaps>;

describe('Feature type utilities', () => {
  it('ExtractCaps extracts capabilities from a feature', () => {
    expectTypeOf<ExtractCaps<MockHttpFeature>>().toEqualTypeOf<MockHttpCaps>();
  });

  it('NamespacedCaps maps feature key to caps', () => {
    type Result = NamespacedCaps<readonly [MockHttpFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly http: MockHttpCaps }>();
  });

  it('NamespacedCaps preserves features with empty caps', () => {
    type Result = NamespacedCaps<readonly [MockHttpFeature, MockEmptyFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly http: MockHttpCaps;
      readonly background: MockEmptyCaps;
    }>();
  });

  it('NamespacedCaps merges multiple features', () => {
    type MockSchedulerCaps = { readonly start: () => void };
    type MockSchedulerFeature = ConfiguredFeature<'scheduler', MockSchedulerCaps>;
    type Result = NamespacedCaps<readonly [MockHttpFeature, MockSchedulerFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly http: MockHttpCaps;
      readonly scheduler: MockSchedulerCaps;
    }>();
  });
});
