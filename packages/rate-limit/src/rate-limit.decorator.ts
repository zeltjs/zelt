import { UseMiddleware } from '@zeltjs/core';

import { RateLimitMiddleware } from './rate-limit.middleware';
import type { RateLimitOptions } from './types';

/** @throws {ZeltDecoratorUsageError} */
export const RateLimit = (opts: RateLimitOptions) => UseMiddleware([RateLimitMiddleware, opts]);
