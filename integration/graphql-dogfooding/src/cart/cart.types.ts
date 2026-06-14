export type CartPublicItems = {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
};

export type CartPublic = {
  readonly id: string;
  readonly items: readonly CartPublicItems[];
  readonly totalQuantity: number;
  readonly subtotalCents: number;
  readonly shippingEstimateCents: number;
  readonly grandTotalCents: number;
};
