import { Injectable, inject } from '@zeltjs/core';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

import { DrizzleService } from '../db/drizzle.service';
import { products } from '../db/schema';
import type { Product, NewProduct } from '../db/schema';
import type { CreateProductInput, UpdateProductInput } from './product.schema';

@Injectable()
export class ProductService {
  constructor(private readonly drizzle = inject(DrizzleService)) {}

  async findAll(opts: {
    page: number;
    limit: number;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<{ items: Product[]; total: number }> {
    const conditions = [];

    if (opts.category) {
      conditions.push(eq(products.category, opts.category));
    }
    if (opts.minPrice !== undefined) {
      conditions.push(gte(products.price, opts.minPrice));
    }
    if (opts.maxPrice !== undefined) {
      conditions.push(lte(products.price, opts.maxPrice));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      this.drizzle.db
        .select()
        .from(products)
        .where(where)
        .limit(opts.limit)
        .offset((opts.page - 1) * opts.limit),
      this.drizzle.db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(where),
    ]);

    return { items, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: number): Promise<Product | undefined> {
    const result = await this.drizzle.db
      .select()
      .from(products)
      .where(eq(products.id, id));
    return result[0];
  }

  async create(data: CreateProductInput): Promise<Product> {
    const now = new Date();
    const result = this.drizzle.db
      .insert(products)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      } satisfies NewProduct)
      .returning()
      .get();
    return result;
  }

  async update(id: number, data: UpdateProductInput): Promise<Product | undefined> {
    const existing = await this.findById(id);
    if (!existing) return undefined;

    const result = this.drizzle.db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning()
      .get();
    return result;
  }

  async remove(id: number): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    this.drizzle.db.delete(products).where(eq(products.id, id)).run();
    return true;
  }
}
