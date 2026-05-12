import { describe, expect, it } from 'vitest';

import { getCallerFile } from './source-file';

describe('getCallerFile', () => {
  it('returns the file path of the caller', () => {
    const result = getCallerFile();

    expect(result).toContain('source-file.test.ts');
  });

  it('returns undefined when stack is unavailable', () => {
    const originalStack = Error.prototype.stack;
    Object.defineProperty(Error.prototype, 'stack', { value: undefined, writable: true });

    const result = getCallerFile();

    Object.defineProperty(Error.prototype, 'stack', { value: originalStack, writable: true });
    expect(result).toBeUndefined();
  });
});
