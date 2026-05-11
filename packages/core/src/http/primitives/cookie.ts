import { getCookie } from 'hono/cookie';

import { getEntryContext } from '../internal/entry-context';

export const cookie = (name: string): string | undefined => {
  return getCookie(getEntryContext().honoContext, name);
};
