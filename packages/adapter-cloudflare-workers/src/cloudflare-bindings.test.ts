import { describe, expect, expectTypeOf, it } from 'vitest';

import { CloudflareBindings } from './index';

declare global {
  interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
  }
}

describe('CloudflareBindings', () => {
  it('throws outside request handling', () => {
    const bindings = new CloudflareBindings();

    expect(() => bindings.get('DB')).toThrow(
      /CloudflareBindings\.get\(\) called outside entry execution/,
    );
  });

  it('types binding keys from generated Env', () => {
    const assertTypes = (bindings: CloudflareBindings) => {
      expectTypeOf(bindings.get('DB')).toEqualTypeOf<D1Database>();
      expectTypeOf(bindings.get('CACHE')).toEqualTypeOf<KVNamespace>();
      // @ts-expect-error NOT_FOUND is not generated from Wrangler bindings.
      bindings.get('NOT_FOUND');
    };

    expect(assertTypes).toBeTypeOf('function');
  });
});
