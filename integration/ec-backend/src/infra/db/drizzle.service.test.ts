import type { TestTargetResult } from '@zeltjs/testing';
import { createTestTarget } from '@zeltjs/testing';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleService } from './drizzle.service';
import { orders, users } from './schema';

describe('DrizzleService', () => {
  let testTarget: TestTargetResult<DrizzleService>;
  let drizzle: DrizzleService;

  beforeEach(async () => {
    testTarget = await createTestTarget(DrizzleService);
    drizzle = testTarget.target;
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('creates every application table on construction', () => {
    const tables = drizzle.db
      .all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .map((row) => row.name);

    expect(tables).toEqual(['order_items', 'orders', 'products', 'users']);
  });

  it('enables foreign key enforcement', () => {
    const insertOrphanOrder = () =>
      drizzle.db
        .insert(orders)
        .values({ userId: 999, totalPrice: 100, status: 'confirmed', createdAt: new Date() })
        .run();

    expect(insertOrphanOrder).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('enforces unique user emails', () => {
    const insertUser = () =>
      drizzle.db
        .insert(users)
        .values({ email: 'dup@example.com', passwordHash: 'x', name: 'Dup', createdAt: new Date() })
        .run();

    insertUser();

    expect(insertUser).toThrow(/UNIQUE constraint failed/);
  });

  it('defaults the user role to user', () => {
    const user = drizzle.db
      .insert(users)
      .values({ email: 'a@example.com', passwordHash: 'x', name: 'A', createdAt: new Date() })
      .returning()
      .get();

    expect(user.role).toBe('user');
  });

  it('starts every instance with an empty database', async () => {
    drizzle.db
      .insert(users)
      .values({ email: 'a@example.com', passwordHash: 'x', name: 'A', createdAt: new Date() })
      .run();

    const other = await createTestTarget(DrizzleService);
    const otherUsers = other.target.db.select().from(users).all();
    await other.shutdown();

    expect(otherUsers).toEqual([]);
  });

  it('has nothing to do on startup', async () => {
    await expect(drizzle.startup()).resolves.toBeUndefined();
  });

  it('closes the connection on shutdown', async () => {
    await drizzle.shutdown();

    expect(() => drizzle.db.select().from(users).all()).toThrow(/database connection is not open/);
  });
});
