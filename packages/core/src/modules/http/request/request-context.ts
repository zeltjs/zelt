import type { Context } from 'hono';

import { getHttpContext } from '../internal/context-keys';

/** @throws {ZeltContextNotAvailableError} */
export const requestContext = (): Context => getHttpContext().honoContext;
