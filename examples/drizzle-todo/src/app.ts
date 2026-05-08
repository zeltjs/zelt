import { createHttpApp } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';

import { controllers } from './controllers';

export const app = createHttpApp({
  controllers,
});

export default await onNode(app);
