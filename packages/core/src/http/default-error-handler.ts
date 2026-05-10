import { HTTPException } from 'hono/http-exception';

import type { EnvConfig } from '../modules/env';
import type { ErrorHandlerInstance, RequestContext } from '../middleware/types';

export const createDefaultErrorHandler = (
  envConfig: EnvConfig | undefined,
): ErrorHandlerInstance => ({
  onError(err: Error, _c: RequestContext): Response {
    if (err instanceof HTTPException) return err.getResponse();
    const isDevelopment = envConfig?.get('NODE_ENV') === 'development';
    const message = isDevelopment ? err.message : 'internal server error';
    return Response.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
  },
});
