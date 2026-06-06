import { createApp, http } from '@zeltjs/core';

import { controllers } from './controllers';

export const app = createApp([http({ controllers })]);
