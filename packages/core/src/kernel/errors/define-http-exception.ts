import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type HttpExceptionOptions<TCtx> = {
  buildResponse?: (ctx: TCtx, status: ContentfulStatusCode, message: string) => Response;
};

type HttpExceptionClass<TCtx> = {
  new (
    context: TCtx,
    options?: { status?: ContentfulStatusCode; cause?: unknown },
  ): HTTPException & {
    readonly name: string;
    readonly context: TCtx;
  };
};

export const defineHttpException = <TCtx>(
  errorName: string,
  defaultStatus: ContentfulStatusCode,
  messageFormatter: (ctx: TCtx) => string,
  options?: HttpExceptionOptions<TCtx>,
): HttpExceptionClass<TCtx> => {
  const buildResponse = options?.buildResponse;

  return class extends HTTPException {
    declare readonly name: string;
    readonly context: TCtx;

    constructor(context: TCtx, opts?: { status?: ContentfulStatusCode; cause?: unknown }) {
      const status = opts?.status ?? defaultStatus;
      const message = messageFormatter(context);

      if (buildResponse) {
        super(status, { res: buildResponse(context, status, message), cause: opts?.cause });
      } else {
        super(status, { message, cause: opts?.cause });
      }

      (this as { name: string }).name = errorName;
      this.context = context;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  } as HttpExceptionClass<TCtx>;
};
