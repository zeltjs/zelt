import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { AddToCartSchema, UpdateCartItemSchema } from './cart.schema';

describe('AddToCartSchema', () => {
  it('accepts a positive integer product id and quantity', () => {
    const result = v.safeParse(AddToCartSchema, { productId: 1, quantity: 3 });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ productId: 1, quantity: 3 });
  });

  it('rejects a quantity of 0', () => {
    const result = v.safeParse(AddToCartSchema, { productId: 1, quantity: 0 });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('quantity');
  });

  it('rejects a negative quantity', () => {
    const result = v.safeParse(AddToCartSchema, { productId: 1, quantity: -2 });

    expect(result.success).toBe(false);
  });

  it('rejects a fractional quantity', () => {
    const result = v.safeParse(AddToCartSchema, { productId: 1, quantity: 1.5 });

    expect(result.success).toBe(false);
  });

  it('rejects a product id of 0', () => {
    const result = v.safeParse(AddToCartSchema, { productId: 0, quantity: 1 });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('productId');
  });

  it('rejects a numeric string product id', () => {
    const result = v.safeParse(AddToCartSchema, { productId: '1', quantity: 1 });

    expect(result.success).toBe(false);
  });
});

describe('UpdateCartItemSchema', () => {
  it('accepts a positive quantity', () => {
    const result = v.safeParse(UpdateCartItemSchema, { quantity: 5 });

    expect(result.success).toBe(true);
  });

  it('accepts a quantity of 0 so that the item can be removed', () => {
    const result = v.safeParse(UpdateCartItemSchema, { quantity: 0 });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ quantity: 0 });
  });

  it('rejects a negative quantity', () => {
    const result = v.safeParse(UpdateCartItemSchema, { quantity: -1 });

    expect(result.success).toBe(false);
  });

  it('rejects a fractional quantity', () => {
    const result = v.safeParse(UpdateCartItemSchema, { quantity: 0.5 });

    expect(result.success).toBe(false);
  });

  it('rejects a missing quantity', () => {
    const result = v.safeParse(UpdateCartItemSchema, {});

    expect(result.success).toBe(false);
  });
});
