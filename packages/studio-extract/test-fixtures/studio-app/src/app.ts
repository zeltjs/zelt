import { createApp, http } from '@zeltjs/core';

import { AuditMiddleware } from './audit.middleware';
import { GreetingConfig } from './greeting.config';
import { GreetingController } from './greeting.controller';
import { NotificationHandler } from './notification.handler';

// Only fixture-owned classes are application roots. Eventbus is resolved through
// its normal workspace dependency; no injected copy is needed for inspection.
export const app = createApp(
  [http({ controllers: [GreetingController], middlewares: [AuditMiddleware] })],
  { configs: [GreetingConfig, NotificationHandler] },
);
