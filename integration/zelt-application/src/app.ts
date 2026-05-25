import { createApp } from '@zeltjs/core';

import { BodyParserController } from './body-parser.controller';
import {
  HealthController,
  TenantItemsController,
  UsersController,
} from './global-prefix.controller';
import { ResponseBuilderController } from './response-builder.controller';
import { RoutingController } from './routing.controller';
import { SseController } from './sse.controller';

export const app = createApp({
  http: {
    controllers: [
      HealthController,
      UsersController,
      TenantItemsController,
      BodyParserController,
      ResponseBuilderController,
      RoutingController,
      SseController,
    ],
  },
});
