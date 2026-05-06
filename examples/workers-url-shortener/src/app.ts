import { createHttpApp } from '@zeltjs/core';

import { controllers } from './controllers';

export const app = createHttpApp({
  controllers,
});
