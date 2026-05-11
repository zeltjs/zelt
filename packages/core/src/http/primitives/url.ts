import { getEntryContext } from '../internal/entry-context';

export const url = (): string => {
  return getEntryContext().honoContext.req.url;
};

export const path = (): string => {
  return getEntryContext().honoContext.req.path;
};

export const method = (): string => {
  return getEntryContext().honoContext.req.method;
};
