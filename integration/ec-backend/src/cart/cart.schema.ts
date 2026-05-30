import * as v from 'valibot';

export const AddToCartSchema = v.object({
  productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const UpdateCartItemSchema = v.object({
  quantity: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export type AddToCartInput = v.InferOutput<typeof AddToCartSchema>;
export type UpdateCartItemInput = v.InferOutput<typeof UpdateCartItemSchema>;
