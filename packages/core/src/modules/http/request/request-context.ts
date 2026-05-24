import type { Context } from 'hono';

import { getEntryContext } from './entry-context';

/** @throws {ZeltContextNotAvailableError} */
export const requestContext = (): Context => getEntryContext().honoContext;
