import { createApp, http } from '@zeltjs/core';

import { ErrorsController } from './errors.controller';
import { HelloController } from './hello.controller';
import { InterceptorsController } from './interceptors.controller';
import { MiddlewareController } from './middleware.controller';
import { PipesController } from './pipes.controller';
import { UsersController } from './users.controller';

export const app = createApp([
  http({
    controllers: [
      HelloController,
      ErrorsController,
      MiddlewareController,
      PipesController,
      InterceptorsController,
      UsersController,
    ],
  }),
]);
