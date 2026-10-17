import { describe, expect, expectTypeOf, it } from 'vitest';
import { CloudflareBindings } from './index';
import { env } from './test-fixtures/cloudflare-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      CACHE: KVNamespace;
    }
  }
}

describe('CloudflareBindings', () => {
  it('reads native env without a Zelt HTTP request scope', () => {
    env['LABEL'] = 'native-binding';
    expect(new CloudflareBindings().get('LABEL')).toBe('native-binding');
    delete env['LABEL'];
  });

  it('types binding keys from generated Cloudflare.Env', () => {
    const assertTypes = (bindings: CloudflareBindings) => {
      expectTypeOf(bindings.get('DB')).toEqualTypeOf<D1Database>();
      expectTypeOf(bindings.get('CACHE')).toEqualTypeOf<KVNamespace>();
      // @ts-expect-error NOT_FOUND is not generated from Wrangler bindings.
      bindings.get('NOT_FOUND');
    };
    expect(assertTypes).toBeTypeOf('function');
  });
});
