import { createHttpApp } from '@zeltjs/core';

import { controllers } from './controllers';
import { loggingMiddleware } from './middlewares';

export const app = await createHttpApp({
  controllers,
  middlewares: [loggingMiddleware],
});
