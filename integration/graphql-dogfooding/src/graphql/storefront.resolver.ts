import { inject } from '@zeltjs/core';
import { Query, ResolveField, Resolver } from '@zeltjs/graphql';

import { CartService } from '../cart/cart.service';
import type { CartPublic, CartPublicItems } from '../cart/cart.types';
import { CatalogService } from '../catalog/catalog.service';
import type { CategoryPublic, ProductPublic } from '../catalog/catalog.types';
import { CustomerService } from '../customer/customer.service';
import type { CustomerPublic } from '../customer/customer.types';
import { OrderService } from '../order/order.service';
import type { OrderPublic } from '../order/order.types';

@Resolver()
export class StorefrontResolver {
  constructor(
    private readonly catalogService = inject(CatalogService) as CatalogService,
    private readonly customerService = inject(CustomerService) as CustomerService,
    private readonly cartService = inject(CartService) as CartService,
    private readonly orderService = inject(OrderService) as OrderService,
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

  @ResolveField()
  product(parent: CartPublicItems): ProductPublic {
    return this.catalogService.requireProduct(parent.productId);
  }
}
