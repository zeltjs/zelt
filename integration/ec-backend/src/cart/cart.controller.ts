import { JwtMiddleware } from '@zeltjs/auth-jwt';
import {
  Authorized,
  Controller,
  Delete,
  Get,
  inject,
  Post,
  Put,
  request,
  UseMiddleware,
} from '@zeltjs/core';

import { requireUser } from '../auth/current-user.lib';
import { AddToCartSchema, UpdateCartItemSchema } from './cart.schema';
import { CartService } from './cart.service';

@UseMiddleware(JwtMiddleware)
@Controller('/api/cart')
export class CartController {
  constructor(private readonly cartService = inject(CartService)) {}

  @Authorized()
  @Get('/')
  async getCart() {
    const user = requireUser();
    const cart = await this.cartService.getCart(user.id);
    const total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { ...cart, total };
  }

  @Authorized()
  @Post('/items')
  async addItem(req = request(AddToCartSchema)) {
    const user = requireUser();
    const data = await req.body();
    const cart = await this.cartService.addItem(user.id, data.productId, data.quantity);
    return cart;
  }

  @Authorized()
  @Put('/items/:productId')
  async updateItem(req = request(UpdateCartItemSchema)) {
    const user = requireUser();
    const productIdStr = req.pathParam('productId');
    const productId = parseInt(productIdStr, 10);
    const data = await req.body();
    const cart = await this.cartService.updateQuantity(user.id, productId, data.quantity);
    return cart;
  }

  @Authorized()
  @Delete('/items/:productId')
  async removeItem(req = request()) {
    const user = requireUser();
    const productId = parseInt(req.pathParam('productId'), 10);
    const cart = await this.cartService.removeItem(user.id, productId);
    return cart;
  }

  @Authorized()
  @Delete('/')
  async clearCart() {
    const user = requireUser();
    await this.cartService.clearCart(user.id);
    return { cleared: true };
  }
}
