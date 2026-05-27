import { createApp } from '@zeltjs/core';

import { AssignIdMiddleware, MiddlewareController } from './middleware.controller';
import { ScopesController } from './scopes.controller';

export const app = createApp({
  http: {
    controllers: [ScopesController, MiddlewareController],
    middlewares: [AssignIdMiddleware],
  },
});
