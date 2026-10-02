import { describe, expect, it, vi } from 'vitest';

import { getSourcePosition, resolveDefinitionPosition, resolvePosition } from '../inspect/index';
import {
  CaptureStackError,
  captureStackTrace,
  composeClassDecorators,
  createClassDecorator,
  createMethodDecorator,
  createPropertyDecorator,
  getClassMetadata,
  withCallStackTrace,
} from '../runtime/index';

const validStack = [
  'CaptureStackError: Capture stack trace',
  '    at captureStackTrace (/framework/trace.ts:1:1)',
  '    at register (/tmp/user.service.ts:42:7)',
].join('\n');

describe('lazy decorator stack formatting', () => {
  it('formats a captured stack only when inspect requests its position', () => {
    const formatter = vi.spyOn(Error, 'prepareStackTrace').mockReturnValue(validStack);
    try {
      const trace = captureStackTrace();
      expect(trace?.error).toBeInstanceOf(CaptureStackError);
      expect(formatter).not.toHaveBeenCalled();

      expect(resolvePosition(trace)).toEqual({
        sourceFile: '/tmp/user.service.ts',
        line: 42,
        column: 7,
      });
      expect(formatter).toHaveBeenCalledTimes(1);
      resolvePosition(trace);
      expect(formatter).toHaveBeenCalledTimes(1);
    } finally {
      formatter.mockRestore();
    }
  });

  it('records class, method and property metadata without formatting stacks', () => {
    const formatter = vi.spyOn(Error, 'prepareStackTrace').mockReturnValue(validStack);
    try {
      class Service {
        run() {}
      }
      const classProps = { service: true };
      const methodProps = { method: true };
      const fieldProps = { field: true };
      createMethodDecorator(methodProps)(
        Service.prototype,
        'run',
        Object.getOwnPropertyDescriptor(Service.prototype, 'run'),
      );
      createPropertyDecorator(fieldProps)(Service.prototype, 'value');
      composeClassDecorators(createClassDecorator(classProps))(Service);

      expect(getClassMetadata(Service)).toEqual({
        props: [classProps],
        methods: [{ name: 'run', props: [methodProps] }],
        properties: [{ name: 'value', props: [fieldProps] }],
      });
      expect(formatter).not.toHaveBeenCalled();
      expect(getSourcePosition(Service)?.line).toBe(42);
      expect(formatter).toHaveBeenCalled();
    } finally {
      formatter.mockRestore();
    }
  });

  it('retains registration frames when the stack is read later', () => {
    function registerFixture() {
      return captureStackTrace();
    }
    const trace = registerFixture();
    function inspectFixture() {
      return resolvePosition(trace);
    }
    const position = inspectFixture();
    expect(position?.sourceFile).toContain('lazy-stack.test.ts');
    expect(trace?.error.stack).toContain('registerFixture');
    expect(trace?.error.stack).not.toContain('inspectFixture');
  });

  it.each([
    '',
    undefined,
    null,
    0,
    false,
    {},
  ])('treats an unavailable stack as missing position information: %s', (stack) => {
    const formatter = vi.spyOn(Error, 'prepareStackTrace').mockReturnValue(stack);
    try {
      const trace = captureStackTrace();
      expect(formatter).not.toHaveBeenCalled();
      expect(resolvePosition(trace)).toBeUndefined();
      expect(resolveDefinitionPosition(trace)).toBeUndefined();
    } finally {
      formatter.mockRestore();
    }
  });

  it('uses the definition stack when the application stack is unavailable', () => {
    const defineTrace = captureStackTrace();
    const callTrace = captureStackTrace();
    if (!defineTrace || !callTrace) throw new Error('Expected captured registration frames');
    defineTrace.error.stack = validStack;
    Object.defineProperty(callTrace.error, 'stack', { value: { unavailable: true } });
    const trace = withCallStackTrace(defineTrace, callTrace);

    expect(resolvePosition(trace)?.line).toBe(42);
    expect(resolveDefinitionPosition(trace)?.line).toBe(42);
  });

  it('does not resolve an application position when the definition stack is unavailable', () => {
    const defineTrace = captureStackTrace();
    const callTrace = captureStackTrace();
    if (!defineTrace || !callTrace) throw new Error('Expected captured registration frames');
    defineTrace.error.stack = '';
    callTrace.error.stack = validStack;

    expect(resolveDefinitionPosition(withCallStackTrace(defineTrace, callTrace))).toBeUndefined();
  });

  it('surfaces formatter errors when inspect reads the stack', () => {
    const error = new Error('Cannot format stack');
    const formatter = vi.spyOn(Error, 'prepareStackTrace').mockImplementation(() => {
      throw error;
    });
    try {
      const trace = captureStackTrace();
      expect(formatter).not.toHaveBeenCalled();
      expect(() => resolvePosition(trace)).toThrow(error);
    } finally {
      formatter.mockRestore();
    }
  });
});
