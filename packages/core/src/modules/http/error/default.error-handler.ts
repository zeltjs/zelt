import { inject } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';

import { EnvService } from '../../../built-in-service/env';
import type { RequestContext } from '../middleware/middleware.types';
import { ErrorHandler } from './error-handler.decorator';

@ErrorHandler
export class DefaultErrorHandler {
  constructor(private readonly env = inject(EnvService)) {}

  onError(err: Error, _c: RequestContext): Response {
    if (err instanceof HTTPException) return err.getResponse();
    const message = this.env.isDevelopment() ? err.message : 'internal server error';
    return Response.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
