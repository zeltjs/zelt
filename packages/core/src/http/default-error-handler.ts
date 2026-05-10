import { HTTPException } from 'hono/http-exception';

import type { EnvConfig } from '../modules/env';

export const createDefaultErrorHandler = (envConfig: EnvConfig | undefined) => {
  const isDevelopment = envConfig?.get('NODE_ENV') === 'development';
  return (err: Error): Response => {
    if (err instanceof HTTPException) return err.getResponse();
    const message = isDevelopment ? err.message : 'internal server error';
    return Response.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
  };
};
