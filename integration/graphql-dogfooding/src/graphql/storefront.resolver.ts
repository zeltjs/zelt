import { inject } from '@zeltjs/core';
import { args, Query, Resolver } from '@zeltjs/graphql';
import { CartService } from '../cart/cart.service';
import type { CartPublic } from '../cart/cart.types';
import { CatalogService } from '../catalog/catalog.service';
import type { CategoryPublic, ProductPublic } from '../catalog/catalog.types';
import { CustomerService } from '../customer/customer.service';
import type { CustomerPublic } from '../customer/customer.types';
import { OrderService } from '../order/order.service';
import type { OrderPublic } from '../order/order.types';
import { GetProductInput } from './storefront.inputs';

@Resolver()
export class StorefrontResolver {
  constructor(
    private readonly catalogService = inject(CatalogService),
    private readonly customerService = inject(CustomerService),
    private readonly cartService = inject(CartService),
    private readonly orderService = inject(OrderService),
  ) {}

  @Query()
  viewer(): CustomerPublic {
    return this.customerService.currentViewer();
  }

  @Query()
  categories(): readonly CategoryPublic[] {
    return this.catalogService.listCategories();
  }

  @Query()
  catalog(): readonly ProductPublic[] {
    return this.catalogService.listProducts();
  }

  @Query()
  product(input = args(GetProductInput)): ProductPublic | null {
    return this.catalogService.findProduct(input.id) ?? null;
  }

  @Query()
  featuredProducts(): readonly ProductPublic[] {
    return this.catalogService.featuredProducts();
  }

  @Query()
  cart(): CartPublic {
    return this.cartService.currentCart(this.customerService.currentViewer().id);
  }

  @Query()
  orderHistory(): readonly OrderPublic[] {
    return this.orderService.history(this.customerService.currentViewer().id);
  }
}
