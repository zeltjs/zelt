import { inject } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';

import { EnvService } from '../../built-in-service/env';

import { ErrorHandler } from './decorators/error-handler';
import type { RequestContext } from './middleware/types';

@ErrorHandler
export class DefaultErrorHandler {
  constructor(private env = inject(EnvService)) {}

  onError(err: Error, _c: RequestContext): Response {
    if (err instanceof HTTPException) return err.getResponse();
    const message = this.env.isDevelopment() ? err.message : 'internal server error';
    return Response.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
