import * as v from 'valibot';

export const GetProductInput = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});

export const AddCartItemInput = v.object({
  productId: v.pipe(v.string(), v.minLength(1)),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
