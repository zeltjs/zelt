import { HTTPException } from 'hono/http-exception';

const isDevelopment = (): boolean => {
  if (typeof process === 'undefined') return false;
  const env: { NODE_ENV?: string } = process.env;
  return env.NODE_ENV === 'development';
};

export const handleError = (err: Error): Response => {
  if (err instanceof HTTPException) return err.getResponse();
  const message = isDevelopment() && err instanceof Error ? err.message : 'internal server error';
  return Response.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
};
