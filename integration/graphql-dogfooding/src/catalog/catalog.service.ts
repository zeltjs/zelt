import { Injectable } from '@zeltjs/core';

import { catalogCategories, catalogProducts } from './catalog.seed';
import type { CategoryPublic, ProductPublic } from './catalog.types';

@Injectable()
export class CatalogService {
  listCategories(): readonly CategoryPublic[] {
    return catalogCategories;
  }

  listProducts(): readonly ProductPublic[] {
    return catalogProducts;
  }

  featuredProducts(): readonly ProductPublic[] {
    return catalogProducts.filter((product) => product.status !== 'sold_out');
  }

  findProduct(productId: string): ProductPublic | undefined {
    return catalogProducts.find((product) => product.id === productId);
  }

  requireProduct(productId: string): ProductPublic {
    const product = this.findProduct(productId);
    if (!product) throw new Error(`Product not found: ${productId}`);
    return product;
  }

  availabilityLabel(product: ProductPublic): string {
    if (product.status === 'sold_out') return 'Sold out';
    if (product.status === 'low_stock') return `Only ${product.stock} left`;
    return 'Ready to ship';
  }
}
