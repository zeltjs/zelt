import { match, P } from 'ts-pattern';

import type { Position } from './position';
import { getCallerPosition } from './position';
import {
  getClassMetadata,
  setClassMetadata,
  setMethodMetadata,
  setPropertyMetadata,
} from './store';

type PendingEntry = {
  readonly name: string;
  readonly pos: Position | undefined;
  readonly props: object;
};

// pendingMethods / pendingFields are keyed on the "shared key" for the class:
//   - TC39: context.metadata (a fresh object created per class)
//   - legacy: cls.prototype (the shared prototype object)
// Both paths converge in flushPendingToClass(cls, sharedKey).
const pendingMethods = new WeakMap<object, PendingEntry[]>();
const pendingFields = new WeakMap<object, PendingEntry[]>();

const appendEntry = (
  store: WeakMap<object, PendingEntry[]>,
  meta: object,
  entry: PendingEntry,
): void => {
  const list = store.get(meta) ?? [];
  store.set(meta, [...list, entry]);
};

const flushPendingToClass = (cls: object, sharedKey: object): void => {
  for (const { name, pos, props } of pendingMethods.get(sharedKey) ?? []) {
    setMethodMetadata(cls, name, pos, props);
  }
  for (const { name, pos, props } of pendingFields.get(sharedKey) ?? []) {
    setPropertyMetadata(cls, name, pos, props);
  }
  pendingMethods.delete(sharedKey);
  pendingFields.delete(sharedKey);
};

// TC39 decorator context detection. Legacy decorators never pass a `kind` field
// in their second argument, so we discriminate on its presence with ts-pattern.

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
  // Class constructors are functions and their `prototype` is non-enumerable,
  // so we go through the Function shape rather than a structural pattern.
  if (typeof cls !== 'function') return cls;
  const proto: unknown = cls.prototype;
  return typeof proto === 'object' && proto !== null ? proto : cls;
};

const asObject = (v: unknown): object | undefined => {
  if (typeof v === 'object' && v !== null) return v;
  if (typeof v === 'function') return v;
  return undefined;
};

export type DefineClassDecoratorOptions<E extends Error = Error> = {
  /**
   * Inspect the props already attached to the class before this decorator runs.
   * Return an Error to abort the application, or undefined to proceed.
   *
   * Callers decide the rejection rule (e.g. "no duplicate decorator name") —
   * this package stays agnostic about the props shape. The error type E is
   * propagated to call sites so consumers keep their concrete error class.
   */
  readonly rejectIfApplied?: (existing: readonly object[]) => E | undefined;
};

export type DefineMethodDecoratorOptions<E extends Error = Error> = {
  readonly rejectStatic?: () => E;
};

// Overloaded signatures so the same decorator works under both TC39 (the
// `(value, context)` form) and legacy `experimentalDecorators` (the
// `(target)` / `(target, propertyKey, descriptor)` forms).

export type ClassDecoratorFn = {
  <T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  <T extends new (...args: never[]) => unknown>(target: T): T | void;
};

export type MethodDecoratorFn = {
  (value: (...args: never[]) => unknown, context: ClassMethodDecoratorContext): void;
  (target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void;
};

export type PropertyDecoratorFn = {
  (value: undefined, context: ClassFieldDecoratorContext): void;
  (target: object, propertyKey: string | symbol): void;
};

export const defineClassDecorator = <TProps extends object, E extends Error = Error>(
  pos: Position | undefined,
  props: TProps,
  options?: DefineClassDecoratorOptions<E>,
): ClassDecoratorFn => {
  /** @throws {E} */
  function decorate<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  /** @throws {E} */
  function decorate<T extends new (...args: never[]) => unknown>(target: T): T | void;
  /** @throws {E} */
  function decorate(...args: unknown[]): unknown {
    const cls = asObject(args[0]);
    if (!cls) return undefined;

    if (options?.rejectIfApplied) {
      const existing = getClassMetadata(cls)?.props ?? [];
      const err: E | undefined = options.rejectIfApplied(existing);
      if (err) throw err;
    }

    setClassMetadata(cls, pos, props);

    return match(args[1])
      .with(tc39ClassContextPattern, (ctx) => {
        if (ctx.metadata) flushPendingToClass(cls, ctx.metadata);
        // TC39: returning a function would be adopted as the replacement class,
        // so return undefined to leave the class unchanged.
        return undefined;
      })
      .otherwise(() => {
        // Legacy class decorator: pendingKey lives on the prototype.
        flushPendingToClass(cls, getPrototypeKey(cls));
        return cls;
      });
  }
  return decorate;
};

export const defineMethodDecorator = <TProps extends object, E extends Error = Error>(
  pos: Position | undefined,
  props: TProps,
  options?: DefineMethodDecoratorOptions<E>,
): MethodDecoratorFn => {
  /** @throws {E} */
  function decorate(
    value: (...args: never[]) => unknown,
    context: ClassMethodDecoratorContext,
  ): void;
  /** @throws {E} */
  function decorate(
    target: object,
    propertyKey: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void;
  /** @throws {E} */
  function decorate(...args: unknown[]): unknown {
    const target = args[0];
    const contextOrName = args[1];

    return match(contextOrName)
      .with(tc39MethodContextPattern, (ctx) => {
        if (ctx.static && options?.rejectStatic) {
          const err: E = options.rejectStatic();
          throw err;
        }
        if (typeof ctx.name !== 'string') return undefined;
        if (!ctx.metadata) return undefined;
        appendEntry(pendingMethods, ctx.metadata, { name: ctx.name, pos, props });
        return undefined;
      })
      .otherwise(() => {
        // Legacy path. target is the prototype for instance methods or the
        // class itself for static methods; isStatic is derived from typeof
        // target.
        const isStatic = typeof target === 'function';
        if (isStatic && options?.rejectStatic) {
          const err: E = options.rejectStatic();
          throw err;
        }
        if (typeof contextOrName !== 'string') return undefined;
        const sharedKey = asObject(target);
        if (!sharedKey) return undefined;
        appendEntry(pendingMethods, sharedKey, { name: contextOrName, pos, props });
        return undefined;
      });
  }
  return decorate;
};

export const definePropertyDecorator = <TProps extends object>(
  pos: Position | undefined,
  props: TProps,
): PropertyDecoratorFn => {
  function decorate(value: undefined, context: ClassFieldDecoratorContext): void;
  function decorate(target: object, propertyKey: string | symbol): void;
  function decorate(...args: unknown[]): unknown {
    const target = args[0];
    const contextOrName = args[1];

    return match(contextOrName)
      .with(tc39FieldContextPattern, (ctx) => {
        if (typeof ctx.name !== 'string') return undefined;
        if (!ctx.metadata) return undefined;
        appendEntry(pendingFields, ctx.metadata, { name: ctx.name, pos, props });
        return undefined;
      })
      .otherwise(() => {
        if (typeof contextOrName !== 'string') return undefined;
        const sharedKey = asObject(target);
        if (!sharedKey) return undefined;
        appendEntry(pendingFields, sharedKey, { name: contextOrName, pos, props });
        return undefined;
      });
  }
  return decorate;
};

// `props ?? {}` widens to `TProps | {}`; constraining `TProps` to `object`
// (which `{}` satisfies) lets us pass it directly without an assertion.
const emptyProps: object = {};

export const createClassDecorator = <TProps extends object>(props?: TProps): ClassDecoratorFn =>
  defineClassDecorator(getCallerPosition(), props ?? emptyProps);

export const createMethodDecorator = <TProps extends object>(props?: TProps): MethodDecoratorFn =>
  defineMethodDecorator(getCallerPosition(), props ?? emptyProps);

export const createPropertyDecorator = <TProps extends object>(
  props?: TProps,
): PropertyDecoratorFn => definePropertyDecorator(getCallerPosition(), props ?? emptyProps);
