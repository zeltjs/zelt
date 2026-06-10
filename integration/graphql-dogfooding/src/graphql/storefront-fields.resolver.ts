import { inject } from '@zeltjs/core';
import { ResolveField, Resolver } from '@zeltjs/graphql';
import type { CartPublicItems } from '../cart/cart.types';
import { CatalogService } from '../catalog/catalog.service';
import type { ProductPublic } from '../catalog/catalog.types';

@Resolver()
export class StorefrontFieldsResolver {
  constructor(private readonly catalogService = inject(CatalogService) as CatalogService) {}

  @ResolveField()
  displayName(parent: ProductPublic): string {
    const category = this.catalogService
      .listCategories()
      .find((item) => item.slug === parent.category);
    return `${parent.name} - ${category?.title ?? parent.category}`;
  }

  @ResolveField()
  availabilityLabel(parent: ProductPublic): string {
    return this.catalogService.availabilityLabel(parent);
  }

  @ResolveField()
  lineTotalCents(parent: CartPublicItems): number {
    return parent.unitPriceCents * parent.quantity;
  }
}
