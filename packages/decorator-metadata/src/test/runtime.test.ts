import { describe, expect, it } from 'vitest';
import type { Position } from '../runtime/position';
import { getCallerPosition } from '../runtime/position';
import {
  getClassMetadata,
  setClassMetadata,
  setMethodMetadata,
  setPropertyMetadata,
} from '../runtime/store';

describe('getCallerPosition', () => {
  it('returns position with sourceFile, line, column', () => {
    const pos = getCallerPosition();

    expect(pos).toBeDefined();
    expect(pos?.sourceFile).toContain('runtime.test.ts');
    expect(typeof pos?.line).toBe('number');
    expect(typeof pos?.column).toBe('number');
    expect(pos?.line).toBeGreaterThan(0);
    expect(pos?.column).toBeGreaterThan(0);
  });
});

describe('metadata store', () => {
  const mockPos: Position = { sourceFile: '/test.ts', line: 10, column: 1 };

  it('stores and retrieves class metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockPos, { basePath: '/api' });
    const meta = getClassMetadata(TestClass);

    expect(meta).toEqual({
      pos: mockPos,
      props: { basePath: '/api' },
      methods: [],
      properties: [],
    });
  });

  it('stores and retrieves method metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockPos, {});
    setMethodMetadata(TestClass, 'getUser', mockPos, { method: 'GET' });

    const meta = getClassMetadata(TestClass);
    expect(meta?.methods).toHaveLength(1);
    expect(meta?.methods[0]).toEqual({
      name: 'getUser',
      pos: mockPos,
      props: { method: 'GET' },
    });
  });

  it('stores and retrieves property metadata', () => {
    class TestClass {}

    setClassMetadata(TestClass, mockPos, {});
    setPropertyMetadata(TestClass, 'name', mockPos, { nullable: false });

    const meta = getClassMetadata(TestClass);
    expect(meta?.properties).toHaveLength(1);
    expect(meta?.properties[0]).toEqual({
      name: 'name',
      pos: mockPos,
      props: { nullable: false },
    });
  });

  it('returns undefined for class without metadata', () => {
    class NoMetaClass {}
    expect(getClassMetadata(NoMetaClass)).toBeUndefined();
  });
});
