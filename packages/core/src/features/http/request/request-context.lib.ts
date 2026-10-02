import type { RequestContext } from '../middleware/middleware.types';
import { getHonoContext, prepareBodySourceForRawAccess } from './injection';

export { getHonoContext, setHonoContext } from './injection';

/** @throws {ZeltContextNotAvailableError | TypeError} */
export const requestContext = (): RequestContext => {
  const ctx = getHonoContext();
  prepareBodySourceForRawAccess();
  return ctx;
};
