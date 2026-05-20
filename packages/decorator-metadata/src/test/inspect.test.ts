import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getTypeMetadata } from '../inspect/index';

describe('getTypeMetadata', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('extracts class metadata with methods', async () => {
    const { UserController } = await import('./fixtures/sample.controller');

    const result = await getTypeMetadata(UserController, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const meta = result.value;
    expect(meta.name).toBe('UserController');
    expect(meta.props).toEqual([{ basePath: '/users' }]);
    expect(meta.methods).toHaveLength(2);

    const getUser = meta.methods.find((m) => m.name === 'getUser');
    expect(getUser).toBeDefined();
    expect(getUser?.props).toEqual([{ method: 'GET', path: '/:id' }]);
    expect(getUser?.params).toHaveLength(1);
    expect(getUser?.params[0]?.name).toBe('_id');

    expect(getUser?.returnType.kind).toBe('union');
  });

  it('extracts property metadata', async () => {
    const { Entity } = await import('./fixtures/sample.controller');

    const result = await getTypeMetadata(Entity, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const meta = result.value;
    expect(meta.properties).toHaveLength(2);

    const nameProp = meta.properties.find((p) => p.name === 'name');
    expect(nameProp?.props).toEqual([{ nullable: false }]);
    expect(nameProp?.type.kind).toBe('primitive');

    const descProp = meta.properties.find((p) => p.name === 'description');
    expect(descProp?.props).toEqual([{ nullable: true }]);
    expect(descProp?.optional).toBe(true);
  });

  it('returns error for class without metadata', async () => {
    class NoMetadata {}

    const result = await getTypeMetadata(NoMetadata, {
      tsconfig: resolve(__dirname, '../../tsconfig.json'),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('NO_METADATA');
    }
  });
});
