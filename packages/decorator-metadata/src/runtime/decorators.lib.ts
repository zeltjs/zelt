import { isClassConstructor, toUnknownCallable } from '@zeltjs/unsafe-type-lib';
import type { FieldContext, MethodContext } from './decorator-context.lib';
import { isClassContext, isFieldContext, isMethodContext } from './decorator-context.lib';

import {
  aggregateMembers,
  ensureClassMeta,
  getClassMetadata,
  recordClass,
  recordMethod,
  recordProperty,
} from './store.lib';
import { captureStackTrace, withCallStackTrace } from './trace.lib';

// =============================================================================
// Types
// =============================================================================

export type ClassDecoratorOptions<E extends Error = Error> = {
  readonly rejectIfApplied?: (existing: readonly object[]) => E | undefined;
  readonly afterApply?: (cls: new (...args: never[]) => unknown) => void;
};

export type MethodDecoratorOptions<E extends Error = Error> = {
  readonly rejectStatic?: () => E;
  readonly afterApply?: (method: DecoratedMethod, name: string | symbol) => void;
};

export type ClassDecoratorFn = {
  <T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  <T extends abstract new (...args: never[]) => unknown>(target: T): T | undefined;
};

export type MethodDecoratorFn = {
  (value: (...args: never[]) => unknown, context: ClassMethodDecoratorContext): void;
  (target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void;
};

export type PropertyDecoratorFn = {
  (value: undefined, context: ClassFieldDecoratorContext): void;
  (target: object, propertyKey: string | symbol): void;
};

// =============================================================================
// Adapter Layer - Normalize TC39/Legacy differences
// =============================================================================

const getPrototypeKey = (cls: object): object => {
  if (typeof cls !== 'function') return cls;
  const proto: unknown = cls.prototype;
  return typeof proto === 'object' && proto !== null ? proto : cls;
};

const asObject = (v: unknown): object | undefined => {
  if (typeof v === 'object' && v !== null) return v;
  if (typeof v === 'function') return v;
  return undefined;
};

type Constructor = new (...args: never[]) => unknown;
type DecoratedMethod = (...args: never[]) => unknown;

type ClassHandler = (cls: Constructor, classKey: object) => void;

const adaptClassContext = (handler: ClassHandler): ClassDecoratorFn => {
  function decorate<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function decorate<T extends abstract new (...args: never[]) => unknown>(target: T): T | undefined;
  function decorate(...args: unknown[]): unknown {
    const cls = isClassConstructor(args[0]) ? args[0] : undefined;
    if (!cls) return undefined;

    const context = args[1];
    if (isClassContext(context)) {
      handler(cls, context.metadata ?? getPrototypeKey(cls));
      return undefined;
    }
    handler(cls, getPrototypeKey(cls));
    return cls;
  }
  return decorate;
};

export type ConfigurableClassDecoratorFn<TOptions> = ClassDecoratorFn &
  ((options?: TOptions) => ClassDecoratorFn);

export const createConfigurableClassDecorator = <TOptions extends Record<string, unknown>>(
  factory: (rawOptions: unknown) => ClassDecoratorFn,
): ConfigurableClassDecoratorFn<TOptions> => {
  function decorate<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function decorate<T extends abstract new (...args: never[]) => unknown>(target: T): T | undefined;
  function decorate(options?: TOptions): ClassDecoratorFn;
  function decorate(...args: unknown[]): unknown {
    if (isClassConstructor(args[0])) {
      const fn: (...a: unknown[]) => unknown = factory(undefined);
      return fn(...args);
    }
    return factory(args[0]);
  }
  return decorate;
};

export const dispatchClassOrMethodDecorator = (
  classDecorate: ClassDecoratorFn,
  methodDecorate: MethodDecoratorFn,
): ClassDecoratorFn & MethodDecoratorFn => {
  function dispatch<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function dispatch(
    value: (...args: never[]) => unknown,
    context: ClassMethodDecoratorContext,
  ): void;
  function dispatch<T extends new (...args: never[]) => unknown>(target: T): T | undefined;
  function dispatch(
    target: object,
    propertyKey: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void;
  function dispatch(...args: unknown[]): unknown {
    const context = args[1];
    const isClassDecorator = context === undefined || context === null || isClassContext(context);
    const fn = isClassDecorator
      ? toUnknownCallable(classDecorate)
      : toUnknownCallable(methodDecorate);
    return fn(...args);
  }
  return dispatch;
};

type MethodInfo = {
  readonly classKey: object;
  readonly name: string | symbol;
  readonly isStatic: boolean;
  readonly method: DecoratedMethod | undefined;
};

type MethodHandler = (info: MethodInfo) => void;

const toDecoratedMethod = (v: unknown): DecoratedMethod | undefined =>
  typeof v === 'function' ? toUnknownCallable(v) : undefined;

const applyMethodContext = (
  handler: MethodHandler,
  target: unknown,
  ctx: MethodContext,
): undefined => {
  if (typeof ctx.name !== 'string' && typeof ctx.name !== 'symbol') return undefined;
  if (!ctx.metadata) return undefined;
  handler({
    classKey: ctx.metadata,
    name: ctx.name,
    isStatic: ctx.static ?? false,
    method: toDecoratedMethod(target),
  });
  return undefined;
};

const applyLegacyMethod = (
  handler: MethodHandler,
  target: unknown,
  contextOrName: unknown,
  descriptor: unknown,
): undefined => {
  if (typeof contextOrName !== 'string' && typeof contextOrName !== 'symbol') return undefined;
  const classKey = asObject(target);
  if (!classKey) return undefined;
  const desc: PropertyDescriptor | undefined =
    typeof descriptor === 'object' && descriptor !== null ? descriptor : undefined;
  handler({
    classKey,
    name: contextOrName,
    isStatic: typeof target === 'function',
    method: toDecoratedMethod(desc?.value),
  });
  return undefined;
};

const adaptMethodContext = (handler: MethodHandler): MethodDecoratorFn => {
  function decorate(
    value: (...args: never[]) => unknown,
    context: ClassMethodDecoratorContext,
  ): void;
  function decorate(
    target: object,
    propertyKey: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void;
  function decorate(...args: unknown[]): unknown {
    const target = args[0];
    const contextOrName = args[1];
    const descriptor = args[2];

    return isMethodContext(contextOrName)
      ? applyMethodContext(handler, target, contextOrName)
      : applyLegacyMethod(handler, target, contextOrName, descriptor);
  }
  return decorate;
};

type PropertyHandler = (classKey: object, name: string | symbol) => void;

const applyFieldContext = (handler: PropertyHandler, ctx: FieldContext): undefined => {
  if (typeof ctx.name !== 'string' && typeof ctx.name !== 'symbol') return undefined;
  if (!ctx.metadata) return undefined;
  handler(ctx.metadata, ctx.name);
  return undefined;
};

const applyLegacyProperty = (
  handler: PropertyHandler,
  target: unknown,
  contextOrName: unknown,
): undefined => {
  if (typeof contextOrName !== 'string' && typeof contextOrName !== 'symbol') return undefined;
  const classKey = asObject(target);
  if (!classKey) return undefined;
  handler(classKey, contextOrName);
  return undefined;
};

const adaptPropertyContext = (handler: PropertyHandler): PropertyDecoratorFn => {
  function decorate(value: undefined, context: ClassFieldDecoratorContext): void;
  function decorate(target: object, propertyKey: string | symbol): void;
  function decorate(...args: unknown[]): unknown {
    const target = args[0];
    const contextOrName = args[1];

    return isFieldContext(contextOrName)
      ? applyFieldContext(handler, contextOrName)
      : applyLegacyProperty(handler, target, contextOrName);
  }
  return decorate;
};

// =============================================================================
// Public API
// =============================================================================

/** @throws {E} */
export const createClassDecorator = <TProps extends object, E extends Error = Error>(
  props: TProps,
  options?: ClassDecoratorOptions<E>,
): ClassDecoratorFn => {
  const defineTrace = captureStackTrace();
  const rejectIfApplied = options?.rejectIfApplied;
  const afterApply = options?.afterApply;

  return adaptClassContext((cls, classKey) => {
    if (rejectIfApplied) {
      const err: E | undefined = rejectIfApplied(getClassMetadata(cls)?.props ?? []);
      if (err) throw err;
    }
    const trace = withCallStackTrace(defineTrace, captureStackTrace());
    recordClass(cls, trace, props);
    aggregateMembers(cls, classKey);
    afterApply?.(cls);
  });
};

/** @throws {E} */
export const createMethodDecorator = <TProps extends object, E extends Error = Error>(
  props: TProps,
  options?: MethodDecoratorOptions<E>,
): MethodDecoratorFn => {
  const defineTrace = captureStackTrace();

  return adaptMethodContext((info) => {
    if (info.isStatic && options?.rejectStatic) {
      const err: E = options.rejectStatic();
      throw err;
    }

    const trace = withCallStackTrace(defineTrace, captureStackTrace());
    recordMethod(info.classKey, info.name, trace, props);
    if (options?.afterApply && info.method) options.afterApply(info.method, info.name);
  });
};

export type PropertyDecoratorOptions = {
  readonly afterApply?: (propertyName: string | symbol) => void;
};

export const createPropertyDecorator = <TProps extends object>(
  props: TProps,
  options?: PropertyDecoratorOptions,
): PropertyDecoratorFn => {
  const defineTrace = captureStackTrace();

  return adaptPropertyContext((classKey, name) => {
    const trace = withCallStackTrace(defineTrace, captureStackTrace());
    recordProperty(classKey, name, trace, props);
    options?.afterApply?.(name);
  });
};

// =============================================================================
// Compose API
// =============================================================================

export const composeClassDecorators = (...decorators: ClassDecoratorFn[]): ClassDecoratorFn => {
  const defineTrace = captureStackTrace();

  function decorate<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function decorate<T extends abstract new (...args: never[]) => unknown>(target: T): T | undefined;
  function decorate(...args: unknown[]): unknown {
    const cls = asObject(args[0]);
    if (!cls) return undefined;

    const trace = withCallStackTrace(defineTrace, captureStackTrace());
    if (trace) ensureClassMeta(cls, trace);

    for (const dec of decorators) {
      const fn: (...a: unknown[]) => unknown = dec;
      const result = fn(...args);
      if (result !== undefined) {
        args[0] = result;
      }
    }

    return isClassContext(args[1]) ? undefined : args[0];
  }
  return decorate;
};

export const composeMethodDecorators = (...decorators: MethodDecoratorFn[]): MethodDecoratorFn => {
  function decorate(
    value: (...args: never[]) => unknown,
    context: ClassMethodDecoratorContext,
  ): void;
  function decorate(
    target: object,
    propertyKey: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void;
  function decorate(...args: unknown[]): unknown {
    for (const dec of decorators) {
      const fn = toUnknownCallable(dec);
      fn(...args);
    }
    return undefined;
  }
  return decorate;
};

export const composePropertyDecorators = (
  ...decorators: PropertyDecoratorFn[]
): PropertyDecoratorFn => {
  function decorate(value: undefined, context: ClassFieldDecoratorContext): void;
  function decorate(target: object, propertyKey: string | symbol): void;
  function decorate(...args: unknown[]): unknown {
    for (const dec of decorators) {
      const fn = toUnknownCallable(dec);
      fn(...args);
    }
    return undefined;
  }
  return decorate;
};
