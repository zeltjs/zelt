import { inject } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';

import { Env } from '../../../built-in-service/env';
import type { RequestContext } from '../middleware/middleware.types';
import { ErrorHandler } from './error-handler.decorator';

@ErrorHandler
export class DefaultErrorHandler {
  constructor(private readonly env = inject(Env)) {}

  onError(err: Error, _c: RequestContext): Response {
    if (err instanceof HTTPException) return err.getResponse();
    const isDev = this.env.getString('NODE_ENV', 'production') === 'development';
    const message = isDev ? err.message : 'internal server error';
    return Response.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
