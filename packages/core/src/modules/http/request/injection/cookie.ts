import { getCookie } from 'hono/cookie';

import { requestContext } from '../request-context';

/** @throws {ZeltContextNotAvailableError} */
export const cookie = (name: string): string | undefined => {
  return getCookie(requestContext(), name);
};
