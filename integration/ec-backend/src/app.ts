import { createApp, http } from '@zeltjs/core';
import { eventbus, MemoryEventBusAdaptor } from '@zeltjs/eventbus';

import './context-schema';
import { EcCorsConfig } from './config/ec-cors.config';
import { EcJwtConfig } from './config/ec-jwt.config';
import { AuthController } from './entry/controllers/auth.controller';
import { CartController } from './entry/controllers/cart.controller';
import { OrderController } from './entry/controllers/order.controller';
import { ProductController } from './entry/controllers/product.controller';
import { OrderHandlers } from './entry/job/order.handlers';
import { LoggingMiddleware } from './entry/middleware/logging.middleware';

export const createEcApp = () =>
  createApp(
    [
      http({
        controllers: [AuthController, ProductController, CartController, OrderController],
        middlewares: [LoggingMiddleware],
      }),
      eventbus({ adaptor: MemoryEventBusAdaptor, handlers: [OrderHandlers] }),
    ],
    { configs: [EcJwtConfig, EcCorsConfig] },
  );
