export type OrderStatus = 'draft' | 'confirmed' | 'cancelled';

export type OrderPublicItems = {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
};

export type OrderPublic = {
  readonly id: string;
  readonly status: OrderStatus;
  readonly itemCount: number;
  readonly totalCents: number;
  readonly items: readonly OrderPublicItems[];
};
