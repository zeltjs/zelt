export type MethodDecoratorArgs = {
  readonly pendingKey: object;
  readonly methodName: string | symbol;
  readonly isStatic: boolean;
};

export type ClassDecoratorArgs = {
  readonly cls: object;
  readonly pendingKey: object;
};

type TC39MethodContext = {
  kind: 'method';
  readonly name: string | symbol;
  readonly static: boolean;
  readonly metadata: object;
};

type TC39ClassContext = {
  kind: 'class';
  readonly metadata: object;
};

const isTC39Context = (arg: unknown): arg is { kind: string; metadata: object } =>
  typeof arg === 'object' && arg !== null && 'kind' in arg;

export const resolveMethodArgs = (args: unknown[]): MethodDecoratorArgs => {
  const [first, second] = args;

  if (isTC39Context(second)) {
    const ctx = second as TC39MethodContext;
    return {
      pendingKey: ctx.metadata,
      methodName: ctx.name,
      isStatic: ctx.static,
    };
  }

  const target = first as object;
  const isStatic = typeof target === 'function';
  return {
    pendingKey: target,
    methodName: second as string | symbol,
    isStatic,
  };
};

export const resolveClassArgs = (args: unknown[]): ClassDecoratorArgs => {
  const [target, context] = args;

  if (isTC39Context(context)) {
    const ctx = context as TC39ClassContext;
    return { cls: target as object, pendingKey: ctx.metadata };
  }

  const cls = target as { prototype: object };
  return { cls, pendingKey: cls.prototype };
};
