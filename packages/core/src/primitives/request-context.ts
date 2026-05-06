import type { Context } from 'hono';

import { getEntryContext } from '../internal/entry-context';

export const requestContext = (): Context => getEntryContext().honoContext;
