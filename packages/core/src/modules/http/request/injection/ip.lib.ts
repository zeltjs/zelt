import { requestContext } from '..';

/** @throws {ZeltContextNotAvailableError} */
export const ip = (): string | undefined => {
  const c = requestContext();
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  );
};
