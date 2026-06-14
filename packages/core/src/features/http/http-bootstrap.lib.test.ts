import { describe, expect, it } from 'vitest';

import { runInContext } from '../../kernel';
import { createRequestRootChecker } from './http-bootstrap.lib';

describe('createRequestRootChecker', () => {
  it('treats an existing non-request context without a store creator as request root', () => {
    const isRoot = createRequestRootChecker(Symbol('router'));

    runInContext(() => {
      expect(isRoot()).toBe(true);
    });
  });
});
