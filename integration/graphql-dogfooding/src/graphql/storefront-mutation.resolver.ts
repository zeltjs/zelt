import { inject } from '@zeltjs/core';
import { Mutation, Resolver } from '@zeltjs/graphql';

import { CartService } from '../cart/cart.service';
import type { CartPublic } from '../cart/cart.types';
import { CustomerService } from '../customer/customer.service';
import { OrderService } from '../order/order.service';
import type { OrderPublic } from '../order/order.types';

@Resolver()
export class StorefrontMutationResolver {
  constructor(
    private readonly customerService = inject(CustomerService) as CustomerService,
    private readonly cartService = inject(CartService) as CartService,
    private readonly orderService = inject(OrderService) as OrderService,
  ) {}

  @Mutation()
  addFeaturedBundleToCart(): CartPublic {
    return this.cartService.addFeaturedBundle(this.customerService.currentViewer().id);
  }

  @Mutation()
  checkoutCart(): OrderPublic {
    return this.orderService.checkout(this.customerService.currentViewer().id);
  }
}
