import { HTTPException } from 'hono/http-exception';

export type ErrorHandlerOptions = {
  readonly isDevelopment: boolean;
};

const defaultOptions: ErrorHandlerOptions = {
  isDevelopment: false,
};

export const createHandleError =
  (options: ErrorHandlerOptions = defaultOptions) =>
  (err: Error): Response => {
    if (err instanceof HTTPException) return err.getResponse();
    const message = options.isDevelopment ? err.message : 'internal server error';
    return Response.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
  };

export const handleError = createHandleError();
