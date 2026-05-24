import { match, P } from 'ts-pattern';

import { captureStackTrace } from './position';
import {
  aggregateMembers,
  ensureClassMeta,
  getClassMetadata,
  recordClass,
  recordMethod,
  recordProperty,
} from './store';

// =============================================================================
// Types
// =============================================================================

export type ClassDecoratorOptions<E extends Error = Error> = {
  readonly rejectIfApplied?: (existing: readonly object[]) => E | undefined;
};

export type MethodDecoratorOptions<E extends Error = Error> = {
  readonly rejectStatic?: () => E;
};

export type ClassDecoratorFn = {
  <T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  <T extends new (...args: never[]) => unknown>(target: T): T | undefined;
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

const tc39ClassContextPattern = {
  kind: 'class' as const,
  metadata: P.optional(P.nonNullable),
};

const tc39MethodContextPattern = {
  kind: 'method' as const,
  metadata: P.optional(P.nonNullable),
  static: P.optional(P.boolean),
  name: P.optional(P.union(P.string, P.symbol)),
};

const tc39FieldContextPattern = {
  kind: 'field' as const,
  metadata: P.optional(P.nonNullable),
  static: P.optional(P.boolean),
  name: P.optional(P.union(P.string, P.symbol)),
};

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

type ClassHandler = (cls: object, classKey: object) => void;

const adaptClassContext = (handler: ClassHandler): ClassDecoratorFn => {
  function decorate<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function decorate<T extends new (...args: never[]) => unknown>(target: T): T | undefined;
  function decorate(...args: unknown[]): unknown {
    const cls = asObject(args[0]);
    if (!cls) return undefined;

    return match(args[1])
      .with(tc39ClassContextPattern, (ctx) => {
        if (ctx.metadata) handler(cls, ctx.metadata);
        return undefined;
      })
      .otherwise(() => {
        handler(cls, getPrototypeKey(cls));
        return cls;
      });
  }
  return decorate;
};

type MethodHandler = (classKey: object, name: string, isStatic: boolean) => void;

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

    return match(contextOrName)
      .with(tc39MethodContextPattern, (ctx) => {
        if (typeof ctx.name !== 'string') return undefined;
        if (!ctx.metadata) return undefined;
        handler(ctx.metadata, ctx.name, ctx.static ?? false);
        return undefined;
      })
      .otherwise(() => {
        if (typeof contextOrName !== 'string') return undefined;
        const classKey = asObject(target);
        if (!classKey) return undefined;
        const isStatic = typeof target === 'function';
        handler(classKey, contextOrName, isStatic);
        return undefined;
      });
  }
  return decorate;
};

type PropertyHandler = (classKey: object, name: string) => void;

const adaptPropertyContext = (handler: PropertyHandler): PropertyDecoratorFn => {
  function decorate(value: undefined, context: ClassFieldDecoratorContext): void;
  function decorate(target: object, propertyKey: string | symbol): void;
  function decorate(...args: unknown[]): unknown {
    const target = args[0];
    const contextOrName = args[1];

    return match(contextOrName)
      .with(tc39FieldContextPattern, (ctx) => {
        if (typeof ctx.name !== 'string') return undefined;
        if (!ctx.metadata) return undefined;
        handler(ctx.metadata, ctx.name);
        return undefined;
      })
      .otherwise(() => {
        if (typeof contextOrName !== 'string') return undefined;
        const classKey = asObject(target);
        if (!classKey) return undefined;
        handler(classKey, contextOrName);
        return undefined;
      });
  }
  return decorate;
};

// =============================================================================
// Public API
// =============================================================================

export const createClassDecorator = <TProps extends object, E extends Error = Error>(
  props: TProps,
  options?: ClassDecoratorOptions<E>,
): ClassDecoratorFn => {
  const trace = captureStackTrace();

  return adaptClassContext((cls, classKey) => {
    if (options?.rejectIfApplied) {
      const existing = getClassMetadata(cls)?.props ?? [];
      const err: E | undefined = options.rejectIfApplied(existing);
      if (err) throw err;
    }

    recordClass(cls, trace, props);
    aggregateMembers(cls, classKey);
  });
};

export const createMethodDecorator = <TProps extends object, E extends Error = Error>(
  props: TProps,
  options?: MethodDecoratorOptions<E>,
): MethodDecoratorFn => {
  const trace = captureStackTrace();

  return adaptMethodContext((classKey, name, isStatic) => {
    if (isStatic && options?.rejectStatic) {
      const err: E = options.rejectStatic();
      throw err;
    }

    recordMethod(classKey, name, trace, props);
  });
};

export const createPropertyDecorator = <TProps extends object>(
  props: TProps,
): PropertyDecoratorFn => {
  const trace = captureStackTrace();

  return adaptPropertyContext((classKey, name) => {
    recordProperty(classKey, name, trace, props);
  });
};

// =============================================================================
// Compose API
// =============================================================================

export const composeClassDecorators = (...decorators: ClassDecoratorFn[]): ClassDecoratorFn => {
  const trace = captureStackTrace();

  function decorate<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function decorate<T extends new (...args: never[]) => unknown>(target: T): T | undefined;
  function decorate(...args: unknown[]): unknown {
    const cls = asObject(args[0]);
    if (!cls) return undefined;

    if (trace) ensureClassMeta(cls, trace);

    for (const dec of decorators) {
      const fn: (...a: unknown[]) => unknown = dec;
      const result = fn(...args);
      if (result !== undefined) {
        args[0] = result;
      }
    }

    return match(args[1])
      .with(tc39ClassContextPattern, () => undefined)
      .otherwise(() => args[0]);
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
      const fn = dec as unknown as (...a: unknown[]) => unknown;
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
      const fn = dec as unknown as (...a: unknown[]) => unknown;
      fn(...args);
    }
    return undefined;
  }
  return decorate;
};
