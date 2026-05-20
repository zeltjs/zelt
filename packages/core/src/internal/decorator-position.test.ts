import { describe, expect, it } from 'vitest';

import { getCallerPositionForCore } from './decorator-position';

describe('getCallerPositionForCore', () => {
  it('skips core internal frames and points to the user file', () => {
    const pos = getCallerPositionForCore();
    expect(pos).toBeDefined();
    expect(pos?.sourceFile).toContain('decorator-position.test.ts');
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.column).toBeGreaterThan(0);
  });
});
