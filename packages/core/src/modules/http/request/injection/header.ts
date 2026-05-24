import { getHttpContext } from '../../internal/context-keys';

/** @throws {ZeltContextNotAvailableError} */
export const header = (name: string): string | undefined => {
  return getHttpContext().honoContext.req.header(name);
};
