import { JwtMiddleware } from '@zeltjs/auth-jwt';
import {
  Authorized,
  Controller,
  Get,
  inject,
  Post,
  request,
  response,
  UseMiddleware,
} from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';

import { requireUser } from '../auth/current-user.lib';
import { OrderService } from './order.service';

@UseMiddleware(JwtMiddleware)
@Controller('/api/orders')
export class OrderController {
  constructor(private readonly orderService = inject(OrderService)) {}

  @Authorized()
  @Post('/')
  async create(res = response()) {
    const user = requireUser();
    const order = await this.orderService.createOrder(user.id);
    return res.json(order, 201);
  }

  @Authorized()
  @Get('/')
  async list(req = request()) {
    const user = requireUser();
    const pageStr = req.queryParam('page');
    const limitStr = req.queryParam('limit');
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    const result = await this.orderService.findByUser(user.id, page, limit);
    return { ...result, page, limit };
  }

  @Authorized()
  @Get('/:id')
  async detail(req = request()) {
    const user = requireUser();
    const idStr = req.pathParam('id');
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid order ID' });
    }

    const order = await this.orderService.findById(id, user.id);
    if (!order) {
      throw new HTTPException(404, { message: 'Order not found' });
    }

    const items = await this.orderService.getOrderItems(order.id);
    return { ...order, items };
  }
}
