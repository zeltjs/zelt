import { getEntryContext } from '../entry-context';

/** @throws {ZeltContextNotAvailableError} */
export const ip = (): string | undefined => {
  const honoCtx = getEntryContext().honoContext;
  return (
    honoCtx.req.header('cf-connecting-ip') ??
    honoCtx.req.header('x-real-ip') ??
    honoCtx.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  );
};
