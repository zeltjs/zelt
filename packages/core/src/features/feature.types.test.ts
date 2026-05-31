import { describe, expectTypeOf, it } from 'vitest';

import type { ConfiguredFeature, ExtractCaps, IsEmpty, NamespacedCaps } from './feature.types';

type MockHttpCaps = { readonly fetch: (req: Request) => Promise<Response> };
type MockHttpFeature = ConfiguredFeature<'http', MockHttpCaps>;
// biome-ignore lint/complexity/noBannedTypes: intentional empty caps for testing IsEmpty filtering
type MockEmptyFeature = ConfiguredFeature<'background', {}>;

describe('Feature type utilities', () => {
  it('ExtractCaps extracts capabilities from a feature', () => {
    expectTypeOf<ExtractCaps<MockHttpFeature>>().toEqualTypeOf<MockHttpCaps>();
  });

  it('IsEmpty detects empty objects', () => {
    // biome-ignore lint/complexity/noBannedTypes: intentional empty object for testing IsEmpty
    expectTypeOf<IsEmpty<{}>>().toEqualTypeOf<true>();
    expectTypeOf<IsEmpty<MockHttpCaps>>().toEqualTypeOf<false>();
  });

  it('NamespacedCaps maps feature key to caps', () => {
    type Result = NamespacedCaps<readonly [MockHttpFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly http: MockHttpCaps }>();
  });

  it('NamespacedCaps excludes features with empty caps', () => {
    type Result = NamespacedCaps<readonly [MockHttpFeature, MockEmptyFeature]>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly http: MockHttpCaps }>();
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
