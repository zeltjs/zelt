type ErrorClass<TCtx> = {
  new (
    context: TCtx,
    cause?: unknown,
  ): Error & {
    readonly name: string;
    readonly context: TCtx;
  };
};

export const defineError = <TCtx>(
  name: string,
  messageFormatter: (ctx: TCtx) => string,
): ErrorClass<TCtx> => {
  return class extends Error {
    override readonly name = name;
    constructor(
      public readonly context: TCtx,
      cause?: unknown,
    ) {
      super(messageFormatter(context), { cause });
      Object.setPrototypeOf(this, new.target.prototype);
    }
  } satisfies ErrorClass<TCtx>;
};
