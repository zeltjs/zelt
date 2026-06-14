import { inject } from '@zeltjs/core';
import { args, Mutation, Resolver } from '@zeltjs/graphql';
import { CartService } from '../cart/cart.service';
import type { CartPublic } from '../cart/cart.types';
import { CustomerService } from '../customer/customer.service';
import { OrderService } from '../order/order.service';
import type { OrderPublic } from '../order/order.types';
import { AddCartItemInput } from './storefront.inputs';

@Resolver()
export class StorefrontMutationResolver {
  constructor(
    private readonly customerService = inject(CustomerService),
    private readonly cartService = inject(CartService),
    private readonly orderService = inject(OrderService),
  ) {}

  @Mutation()
  addFeaturedBundleToCart(): CartPublic {
    return this.cartService.addFeaturedBundle(this.customerService.currentViewer().id);
  }

  @Mutation()
  addCartItem(input = args(AddCartItemInput)): CartPublic {
    return this.cartService.addItem(
      this.customerService.currentViewer().id,
      input.productId,
      input.quantity,
    );
  }

  @Mutation()
  checkoutCart(): OrderPublic {
    return this.orderService.checkout(this.customerService.currentViewer().id);
  }
}
