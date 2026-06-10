export type ProductCategory = 'lighting' | 'stationery' | 'storage';

export type ProductStatus = 'available' | 'low_stock' | 'sold_out';

export type ProductPublic = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ProductCategory;
  readonly priceCents: number;
  readonly stock: number;
  readonly status: ProductStatus;
};

export type CategoryPublic = {
  readonly slug: ProductCategory;
  readonly title: string;
};
