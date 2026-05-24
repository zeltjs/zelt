import { captureStackTrace } from '@zeltjs/decorator-metadata';
import { describe, expect, it } from 'vitest';

import { resolvePositionForCore } from './decorator-position';

describe('resolvePositionForCore', () => {
  it('resolves stack trace to user file position', () => {
    const trace = captureStackTrace();
    expect(trace).toBeDefined();

    const pos = resolvePositionForCore(trace);
    expect(pos).toBeDefined();
    expect(pos?.sourceFile).toContain('decorator-position.test.ts');
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.column).toBeGreaterThan(0);
  });
});
