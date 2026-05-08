import { match, P } from 'ts-pattern';

export type MethodDecoratorArgs = {
  readonly pendingKey: object;
  readonly methodName: string | symbol;
  readonly isStatic: boolean;
};

export type InjectableClass = new (...args: never[]) => object;

export type ClassDecoratorArgs = {
  readonly cls: object;
  readonly pendingKey: object;
  readonly injectableClass: InjectableClass;
};

const isSymbol = (v: unknown): boolean => typeof v === 'symbol';
const isObjectOrFunction = (v: unknown): v is object =>
  (typeof v === 'object' && v !== null) || typeof v === 'function';

const tc39MethodPattern = P.shape({
  kind: 'method',
  name: P.union(P.string, P.when(isSymbol)),
  static: P.boolean,
  metadata: P.nonNullable,
});

const tc39ClassPattern = P.shape({
  kind: 'class',
  metadata: P.nonNullable,
});

export const resolveMethodArgs = (args: unknown[]): MethodDecoratorArgs => {
  const [first, second] = args;

  return match(second)
    .with(tc39MethodPattern, (ctx) => {
      const name: string | symbol = typeof ctx.name === 'symbol' ? ctx.name : String(ctx.name);
      return {
        pendingKey: ctx.metadata,
        methodName: name,
        isStatic: ctx.static,
      };
    })
    .otherwise(() => {
      const target = first ?? {};
      const targetObj: object = isObjectOrFunction(target) ? target : {};
      const isStatic = typeof first === 'function';
      const methodName: string | symbol =
        typeof second === 'string' || typeof second === 'symbol' ? second : '';
      return {
        pendingKey: targetObj,
        methodName,
        isStatic,
      };
    });
};

const emptyClass: InjectableClass = class {};
const emptyObject: object = {};

const toInjectableClass = (cls: object): InjectableClass => {
  if (typeof cls !== 'function') return emptyClass;
  // biome-ignore lint/suspicious/noExplicitAny: Type boundary - runtime validation ensures cls is a class
  const result: InjectableClass = cls as any;
  return result;
};

const extractPendingKey = (targetObj: object): object => {
  if (typeof targetObj === 'function') {
    const proto: object = targetObj.prototype ?? emptyObject;
    return proto;
  }
  return emptyObject;
};

export const resolveClassArgs = (args: unknown[]): ClassDecoratorArgs => {
  const [target, context] = args;

  return match(context)
    .with(tc39ClassPattern, (ctx) => {
      const cls: object = isObjectOrFunction(target) ? target : emptyObject;
      return { cls, pendingKey: ctx.metadata, injectableClass: toInjectableClass(cls) };
    })
    .otherwise(() => {
      const targetObj: object = isObjectOrFunction(target) ? target : emptyObject;
      const pendingKey = extractPendingKey(targetObj);
      return {
        cls: targetObj,
        pendingKey,
        injectableClass: toInjectableClass(targetObj),
      };
    });
};
