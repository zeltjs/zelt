import { describe, expect, it } from 'vitest';

import { resolveMethodArgs, resolveClassArgs } from './decorator-context';

describe('resolveMethodArgs', () => {
  it('parses legacy instance method arguments', () => {
    const prototype = { constructor: class TestClass {} };
    const args = [prototype, 'methodName', {}];

    const result = resolveMethodArgs(args);

    expect(result.methodName).toBe('methodName');
    expect(result.isStatic).toBe(false);
    expect(result.pendingKey).toBe(prototype);
  });

  it('parses legacy static method arguments', () => {
    class TestClass {}
    const args = [TestClass, 'staticMethod', {}];

    const result = resolveMethodArgs(args);

    expect(result.methodName).toBe('staticMethod');
    expect(result.isStatic).toBe(true);
    expect(result.pendingKey).toBe(TestClass);
  });

  it('parses TC39 instance method arguments', () => {
    const metadata = {};
    const methodFn = function testMethod() {};
    const context = {
      kind: 'method' as const,
      name: 'testMethod',
      static: false,
      metadata,
    };
    const args = [methodFn, context];

    const result = resolveMethodArgs(args);

    expect(result.methodName).toBe('testMethod');
    expect(result.isStatic).toBe(false);
    expect(result.pendingKey).toBe(metadata);
  });

  it('parses TC39 static method arguments', () => {
    const metadata = {};
    const methodFn = function staticMethod() {};
    const context = {
      kind: 'method' as const,
      name: 'staticMethod',
      static: true,
      metadata,
    };
    const args = [methodFn, context];

    const result = resolveMethodArgs(args);

    expect(result.methodName).toBe('staticMethod');
    expect(result.isStatic).toBe(true);
    expect(result.pendingKey).toBe(metadata);
  });
});

describe('resolveClassArgs', () => {
  it('parses legacy class arguments', () => {
    class TestClass {}
    const args = [TestClass];

    const result = resolveClassArgs(args);

    expect(result.cls).toBe(TestClass);
    expect(result.pendingKey).toBe(TestClass.prototype);
  });

  it('parses TC39 class arguments', () => {
    class TestClass {}
    const metadata = {};
    const context = { kind: 'class' as const, metadata };
    const args = [TestClass, context];

    const result = resolveClassArgs(args);

    expect(result.cls).toBe(TestClass);
    expect(result.pendingKey).toBe(metadata);
  });
});
