import { describe, expect, it } from 'vitest';

import { defineError } from './define-error';

describe('defineError', () => {
  it('creates error class with correct name', () => {
    const TestError = defineError('TestError', () => 'test message');
    const err = new TestError({});
    expect(err.name).toBe('TestError');
  });

  it('formats message using context', () => {
    const TestError = defineError('TestError', (ctx: { id: number }) => `ID: ${ctx.id}`);
    const err = new TestError({ id: 42 });
    expect(err.message).toBe('ID: 42');
  });

  it('supports error cause', () => {
    const TestError = defineError('TestError', () => 'wrapped');
    const cause = new Error('original');
    const err = new TestError({}, cause);
    expect(err.cause).toBe(cause);
  });

  it('works with instanceof', () => {
    const TestError = defineError('TestError', () => 'test');
    const err = new TestError({});
    expect(err instanceof TestError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('exposes context property', () => {
    const TestError = defineError('TestError', (ctx: { foo: string }) => ctx.foo);
    const err = new TestError({ foo: 'bar' });
    expect(err.context).toEqual({ foo: 'bar' });
  });

  it('creates distinct error classes for different names', () => {
    const ErrorA = defineError('ErrorA', () => 'A');
    const ErrorB = defineError('ErrorB', () => 'B');
    const errA = new ErrorA({});
    const errB = new ErrorB({});
    expect(errA instanceof ErrorA).toBe(true);
    expect(errA instanceof ErrorB).toBe(false);
    expect(errB instanceof ErrorB).toBe(true);
    expect(errB instanceof ErrorA).toBe(false);
  });
});
