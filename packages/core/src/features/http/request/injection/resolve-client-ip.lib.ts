import type { Context } from 'hono';

export const resolveClientIp = (c: Context): string | undefined => {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  );
};
