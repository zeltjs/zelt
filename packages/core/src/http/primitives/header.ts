import { getEntryContext } from '../internal/entry-context';

/** @throws {ZeltContextNotAvailableError} */
export const header = (name: string): string | undefined => {
  return getEntryContext().honoContext.req.header(name);
};
