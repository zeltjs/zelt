import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getDependencies } from '../inspect/index';

describe('getDependencies', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('extracts single dependency from constructor inject()', async () => {
    const { SingleDepService } = await import('./fixtures/deps/single-dep');

    const result = await getDependencies(SingleDepService, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0].className).toBe('DependencyA');
  });
});
