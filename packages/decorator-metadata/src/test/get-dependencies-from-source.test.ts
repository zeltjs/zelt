import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getDependenciesFromSource } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');

describe('getDependenciesFromSource', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('extracts dependencies without runtime metadata', async () => {
    const result = await getDependenciesFromSource(
      resolve(__dirname, './fixtures/deps/single-dep.ts'),
      'SingleDepService',
      { tsconfig: TSCONFIG },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.className).toBe('DependencyA');
  });

  it('returns SOURCE_NOT_FOUND for missing file', async () => {
    const result = await getDependenciesFromSource(
      resolve(__dirname, './fixtures/deps/no-such-file.ts'),
      'Anything',
      { tsconfig: TSCONFIG },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });

  it('returns POSITION_INVALID when class is not in file', async () => {
    const result = await getDependenciesFromSource(
      resolve(__dirname, './fixtures/deps/single-dep.ts'),
      'NoSuchClass',
      { tsconfig: TSCONFIG },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('POSITION_INVALID');
  });
});
