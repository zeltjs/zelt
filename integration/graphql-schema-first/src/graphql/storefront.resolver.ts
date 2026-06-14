import { inject } from '@zeltjs/core';
import { Query, Resolver } from '@zeltjs/graphql';

import { CatalogService } from '../catalog/catalog.service';
import { Gql } from '../generated/graphql';

@Resolver()
export class StorefrontResolver {
  constructor(private readonly catalog = inject(CatalogService)) {}

  @Query()
  product(input = Gql.Query.product.args()): Gql.Query.product.Result {
    return this.catalog.findProduct(input.id) ?? null;
  }
}
