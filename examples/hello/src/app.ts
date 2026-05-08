import { createHttpApp } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

import { controllers } from './controllers';
import { loggingMiddleware } from './middlewares';

export const app = createHttpApp({
  controllers,
  middlewares: [loggingMiddleware],
});

export default await onNode(app);
