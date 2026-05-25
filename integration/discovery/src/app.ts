import { createApp } from '@zeltjs/core';

import { HelloController } from './hello.controller';

export const app = createApp({
  http: {
    controllers: [HelloController],
  },
});
