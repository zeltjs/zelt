import { createApp, http } from '@zeltjs/core';

import { AssignIdMiddleware, MiddlewareController } from './middleware.controller';
import {
  AdminBoundController,
  BothBoundController,
  MemberBoundController,
  MemberOnlyController,
} from './options-binding.controller';
import { ScopesController } from './scopes.controller';

export const app = createApp([
  http({
    controllers: [
      ScopesController,
      MiddlewareController,
      AdminBoundController,
      MemberBoundController,
      BothBoundController,
      MemberOnlyController,
    ],
    middlewares: [AssignIdMiddleware],
  }),
]);
