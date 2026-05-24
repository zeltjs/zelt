import { getHttpContext } from '../../internal/context-keys';

/** @throws {ZeltContextNotAvailableError} */
export const url = (): string => {
  return getHttpContext().honoContext.req.url;
};

/** @throws {ZeltContextNotAvailableError} */
export const path = (): string => {
  return getHttpContext().honoContext.req.path;
};

/** @throws {ZeltContextNotAvailableError} */
export const method = (): string => {
  return getHttpContext().honoContext.req.method;
};
