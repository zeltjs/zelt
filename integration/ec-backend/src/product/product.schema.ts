import * as v from 'valibot';

export const CreateProductSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  description: v.string(),
  price: v.pipe(v.number(), v.integer(), v.minValue(1)),
  category: v.pipe(v.string(), v.minLength(1)),
  stock: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const UpdateProductSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1))),
  description: v.optional(v.string()),
  price: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  category: v.optional(v.pipe(v.string(), v.minLength(1))),
  stock: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

export type CreateProductInput = v.InferOutput<typeof CreateProductSchema>;
export type UpdateProductInput = v.InferOutput<typeof UpdateProductSchema>;
