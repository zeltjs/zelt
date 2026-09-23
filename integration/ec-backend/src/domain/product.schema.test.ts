import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { CreateProductSchema, UpdateProductSchema } from './product.schema';

const validProduct = {
  name: 'Keyboard',
  description: 'Mechanical keyboard',
  price: 12000,
  category: 'electronics',
  stock: 10,
};

describe('CreateProductSchema', () => {
  it('accepts a valid product', () => {
    const result = v.safeParse(CreateProductSchema, validProduct);

    expect(result.success).toBe(true);
    expect(result.output).toEqual(validProduct);
  });

  it('accepts an empty description', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, description: '' });

    expect(result.success).toBe(true);
  });

  it('accepts a stock of 0', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, stock: 0 });

    expect(result.success).toBe(true);
  });

  it('accepts the minimum price of 1', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, price: 1 });

    expect(result.success).toBe(true);
  });

  it('rejects a price of 0', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, price: 0 });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('price');
  });

  it('rejects a fractional price', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, price: 99.5 });

    expect(result.success).toBe(false);
  });

  it('rejects a negative stock', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, stock: -1 });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('stock');
  });

  it('rejects an empty name', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, name: '' });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('name');
  });

  it('rejects an empty category', () => {
    const result = v.safeParse(CreateProductSchema, { ...validProduct, category: '' });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('category');
  });

  it('rejects when description is missing', () => {
    const result = v.safeParse(CreateProductSchema, {
      name: validProduct.name,
      price: validProduct.price,
      category: validProduct.category,
      stock: validProduct.stock,
    });

    expect(result.success).toBe(false);
  });
});

describe('UpdateProductSchema', () => {
  it('accepts an empty object because every field is optional', () => {
    const result = v.safeParse(UpdateProductSchema, {});

    expect(result.success).toBe(true);
    expect(result.output).toEqual({});
  });

  it('accepts a partial update', () => {
    const result = v.safeParse(UpdateProductSchema, { price: 500, stock: 0 });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ price: 500, stock: 0 });
  });

  it('rejects a price of 0 even in a partial update', () => {
    const result = v.safeParse(UpdateProductSchema, { price: 0 });

    expect(result.success).toBe(false);
  });

  it('rejects an empty name when name is given', () => {
    const result = v.safeParse(UpdateProductSchema, { name: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a negative stock', () => {
    const result = v.safeParse(UpdateProductSchema, { stock: -5 });

    expect(result.success).toBe(false);
  });
});
