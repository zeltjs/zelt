import { createApp, http } from '@zeltjs/core';
import { eventbus, MemoryEventBusAdaptor } from '@zeltjs/eventbus';

import './context-schema';
import { AuthController } from './auth/auth.controller';
import { EcJwtConfig } from './auth/ec-jwt.config';
import { CartController } from './cart/cart.controller';
import { EcCorsConfig } from './config/ec-cors.config';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { OrderController } from './order/order.controller';
import { OrderHandlers } from './order/order.handlers';
import { ProductController } from './product/product.controller';

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
