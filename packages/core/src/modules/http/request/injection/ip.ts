import { getHttpContext } from '../../internal/context-keys';

/** @throws {ZeltContextNotAvailableError} */
export const ip = (): string | undefined => {
  const { honoContext } = getHttpContext();
  return (
    honoContext.req.header('cf-connecting-ip') ??
    honoContext.req.header('x-real-ip') ??
    honoContext.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  );
};
