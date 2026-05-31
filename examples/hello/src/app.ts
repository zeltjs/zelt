import { onNode } from '@zeltjs/adapter-node';
import { createApp, http } from '@zeltjs/core';

import { controllers } from './controllers';
import { loggingMiddleware } from './middlewares';

export const app = createApp([
  http({
    controllers,
    middlewares: [loggingMiddleware],
  }),
]);

export default await onNode(app);
