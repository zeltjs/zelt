import { createApp } from '@zeltjs/core';

import './context-schema';
import { AuthController } from './auth/auth.controller';
import { EcJwtConfig } from './auth/ec-jwt.config';
import { CartController } from './cart/cart.controller';
import { EcCorsConfig } from './config/ec-cors.config';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { OrderController } from './order/order.controller';
import { ProductController } from './product/product.controller';

export const createEcApp = () =>
  createApp({
    http: {
      controllers: [AuthController, ProductController, CartController, OrderController],
      middlewares: [LoggingMiddleware],
    },
    configs: [EcJwtConfig, EcCorsConfig],
  });
