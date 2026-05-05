import { getEntryContext } from '../internal/entry-context';

export const pathParam = (name: string): string => {
  const value = getEntryContext().input.pathParams[name];
  if (value === undefined) {
    throw new Error(`zelt: path parameter "${name}" is not defined`);
  }
  return value;
};
