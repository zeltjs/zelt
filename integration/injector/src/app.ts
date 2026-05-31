import { createApp, http } from '@zeltjs/core';

import { ChainController } from './chain.controller';
import { ConfigController } from './config.controller';
import { CounterAController } from './counter-a.controller';
import { CounterBController } from './counter-b.controller';
import { ExtendedController } from './extended.controller';

export const app = createApp([
  http({
    controllers: [
      ChainController,
      CounterAController,
      CounterBController,
      ConfigController,
      ExtendedController,
    ],
  }),
]);
