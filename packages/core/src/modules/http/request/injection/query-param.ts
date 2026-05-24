import { getHttpContext } from '../../internal/context-keys';

/** @throws {ZeltContextNotAvailableError} */
export const queryParam = (name: string): string | undefined => {
  return getHttpContext().honoContext.req.query(name);
};

/** @throws {ZeltContextNotAvailableError} */
export const queryParams = (name: string): string[] => {
  return getHttpContext().honoContext.req.queries(name) ?? [];
};
