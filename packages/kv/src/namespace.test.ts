import { describe, expect, it } from 'vitest';

import { joinPrefix } from './namespace';

describe('namespace helpers', () => {
  it('joinPrefix concatenates prefixes', () => {
    expect(joinPrefix('a:', 'b:')).toBe('a:b:');
    expect(joinPrefix('cache:', 'user:')).toBe('cache:user:');
  });
});
