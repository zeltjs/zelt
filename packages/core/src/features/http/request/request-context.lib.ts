import type { RequestContext } from '../middleware/middleware.types';
import { preserveResponseIsolation } from '../response/response-ownership.feature';
import { getHonoContext, prepareBodySourceForRawAccess } from './injection';

export { getHonoContext, setHonoContext } from './injection';

/** @throws {ZeltContextNotAvailableError | TypeError} */
export const requestContext = (): RequestContext => {
  const ctx = getHonoContext();
  prepareBodySourceForRawAccess();
  preserveResponseIsolation(ctx);
  return ctx;
};
