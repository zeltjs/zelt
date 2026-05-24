import { getEntryContext } from '../internal/entry-context';

/** @throws {ZeltContextNotAvailableError} */
export const url = (): string => {
  return getEntryContext().honoContext.req.url;
};

/** @throws {ZeltContextNotAvailableError} */
export const path = (): string => {
  return getEntryContext().honoContext.req.path;
};

/** @throws {ZeltContextNotAvailableError} */
export const method = (): string => {
  return getEntryContext().honoContext.req.method;
};
