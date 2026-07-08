import { createApp, http } from '@zeltjs/core';

import { GreetingController } from './greeting.controller';

export const app = createApp([http({ controllers: [GreetingController] })]);
