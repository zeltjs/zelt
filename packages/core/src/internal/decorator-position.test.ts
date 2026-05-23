import { describe, expect, it } from 'vitest';

import { captureStackTraceForCore, resolvePositionForCore } from './decorator-position';

describe('captureStackTraceForCore and resolvePositionForCore', () => {
  it('captures stack trace and resolves to user file position', () => {
    const trace = captureStackTraceForCore();
    expect(trace).toBeDefined();

    const pos = resolvePositionForCore(trace);
    expect(pos).toBeDefined();
    expect(pos?.sourceFile).toContain('decorator-position.test.ts');
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.column).toBeGreaterThan(0);
  });
});
