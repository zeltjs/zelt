import type { Context } from 'hono';

import { getEntryContext } from '../internal/entry-context';

/** @throws {ZeltContextNotAvailableError} */
export const requestContext = (): Context => getEntryContext().honoContext;
