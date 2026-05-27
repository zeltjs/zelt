import { onNode } from '@zeltjs/adapter-node';
import { createApp } from '@zeltjs/core';

import { controllers } from './controllers';
import { LoggingMiddleware } from './middlewares';

export const app = createApp({
  http: {
    controllers,
    middlewares: [LoggingMiddleware],
  },
});

export default await onNode(app);
