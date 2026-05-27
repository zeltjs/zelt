import { createApp } from '@zeltjs/core';

import { UsersController } from './users.controller';

export const app = createApp({
  http: {
    controllers: [UsersController],
  },
});
