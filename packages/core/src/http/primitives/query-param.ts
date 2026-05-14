import { getEntryContext } from '../internal/entry-context';

/** @throws {ZeltContextNotAvailableError} */
export const queryParam = (name: string): string | undefined => {
  return getEntryContext().honoContext.req.query(name);
};

/** @throws {ZeltContextNotAvailableError} */
export const queryParams = (name: string): string[] => {
  return getEntryContext().honoContext.req.queries(name) ?? [];
};
