import { getEntryContext } from '../internal/entry-context';

export const queryParam = (name: string): string | undefined => {
  return getEntryContext().honoContext.req.query(name);
};

export const queryParams = (name: string): string[] => {
  return getEntryContext().honoContext.req.queries(name) ?? [];
};
