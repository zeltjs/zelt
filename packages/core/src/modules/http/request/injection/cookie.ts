import { getCookie } from 'hono/cookie';

import { getEntryContext } from '../entry-context';

/** @throws {ZeltContextNotAvailableError} */
export const cookie = (name: string): string | undefined => {
  return getCookie(getEntryContext().honoContext, name);
};
