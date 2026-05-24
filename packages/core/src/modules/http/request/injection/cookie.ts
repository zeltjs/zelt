import { getCookie } from 'hono/cookie';

import { getHttpContext } from '../../internal/context-keys';

/** @throws {ZeltContextNotAvailableError} */
export const cookie = (name: string): string | undefined => {
  return getCookie(getHttpContext().honoContext, name);
};
