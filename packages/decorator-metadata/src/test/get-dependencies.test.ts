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
    expect(result.value[0]?.className).toBe('DependencyA');
  });

  it('extracts multiple dependencies from constructor', async () => {
    const { MultiDepService } = await import('./fixtures/deps/multi-dep');

    const result = await getDependencies(MultiDepService, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    expect(result.value).toHaveLength(3);

    const classNames = result.value.map((d) => d.className);
    expect(classNames).toContain('DepA');
    expect(classNames).toContain('DepB');
    expect(classNames).toContain('DepC');
  });

  it('returns empty array for class with no dependencies', async () => {
    const { NoDepService } = await import('./fixtures/deps/no-dep');

    const result = await getDependencies(NoDepService, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    expect(result.value).toHaveLength(0);
  });

  it('detects hasConfigDecorator for @Config classes', async () => {
    const { ServiceWithConfig } = await import('./fixtures/deps/with-config');

    const result = await getDependencies(ServiceWithConfig, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.className).toBe('TestConfig');
    expect(result.value[0]?.hasConfigDecorator).toBe(true);
  });

  it('extracts decorator names of dependency classes', async () => {
    const { SingleDepService } = await import('./fixtures/deps/single-dep');

    const result = await getDependencies(SingleDepService, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    // DependencyA にはローカル @Service が付いている
    expect(result.value[0]?.decorators).toEqual(['Service']);
  });

  it('returns empty decorators for undecorated dependency class', async () => {
    const { PlainDepService } = await import('./fixtures/deps/plain-dep');

    const result = await getDependencies(PlainDepService, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    expect(result.value[0]?.decorators).toEqual([]);
  });

  it('returns error for class without decorator metadata', async () => {
    class PlainClass {}

    const result = await getDependencies(PlainClass, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('NO_METADATA');
    }
  });
});
