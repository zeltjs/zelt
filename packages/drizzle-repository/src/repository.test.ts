import { createApp } from '@zeltjs/core';
import {
  ConflictError,
  DbError,
  EntityNotFoundError,
  NOT_EXIST,
  StagingDuplicateError,
  stage,
  stageDelete,
  withStagingScope,
} from '@zeltjs/drizzle-repository';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleService as MySqlDrizzleService } from './test/fixtures/mysql/drizzle.service';
import { OrderRepositoryBase as MySqlOrders } from './test/fixtures/mysql/generated/repository/order.repository-base';
import { ProductRepositoryBase as MySqlProducts } from './test/fixtures/mysql/generated/repository/product.repository-base';
import { TenantRepositoryBase as MySqlTenants } from './test/fixtures/mysql/generated/repository/tenant.repository-base';
import { UserRepositoryBase as MySqlUsers } from './test/fixtures/mysql/generated/repository/user.repository-base';
import * as mysqlSchema from './test/fixtures/mysql/schema';
import { DrizzleService as PgDrizzleService } from './test/fixtures/pg/drizzle.service';
import { OrderRepositoryBase as PgOrders } from './test/fixtures/pg/generated/repository/order.repository-base';
import { ProductRepositoryBase as PgProducts } from './test/fixtures/pg/generated/repository/product.repository-base';
import { TenantRepositoryBase as PgTenants } from './test/fixtures/pg/generated/repository/tenant.repository-base';
import { UserRepositoryBase as PgUsers } from './test/fixtures/pg/generated/repository/user.repository-base';
import * as pgSchema from './test/fixtures/pg/schema';
import { DrizzleService as SqliteDrizzleService } from './test/fixtures/sqlite/drizzle.service';
import type { Order } from './test/fixtures/sqlite/generated/model/order.model';
import type { TenantExistedId } from './test/fixtures/sqlite/generated/model/tenant.model';
import type { User, UserExistedId } from './test/fixtures/sqlite/generated/model/user.model';
import { OrderRepositoryBase as SqliteOrders } from './test/fixtures/sqlite/generated/repository/order.repository-base';
import { ProductRepositoryBase as SqliteProducts } from './test/fixtures/sqlite/generated/repository/product.repository-base';
import { TenantRepositoryBase as SqliteTenants } from './test/fixtures/sqlite/generated/repository/tenant.repository-base';
import { UserRepositoryBase as SqliteUsers } from './test/fixtures/sqlite/generated/repository/user.repository-base';
import * as sqliteSchema from './test/fixtures/sqlite/schema';

type PublicOf<T> = { [K in keyof T]: T[K] };

// The generated code is the same for every dialect, so one contract runs against each database.
type ContractDeps = {
  readonly tenants: PublicOf<SqliteTenants>;
  readonly users: PublicOf<SqliteUsers>;
  readonly products: PublicOf<SqliteProducts>;
  readonly orders: PublicOf<SqliteOrders>;
  readonly itemsOf: (
    orderId: string,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
  readonly orderExists: (orderId: string) => Promise<boolean>;
  // Runs the work in an outer transaction: DatabaseService.withTransaction(), which @Transaction() of @zeltjs/db calls.
  readonly inTransaction: <T>(fn: () => Promise<T>) => Promise<T>;
  // Number of statements the database client sent while the work ran.
  readonly queriesDuring: (fn: () => Promise<unknown>) => Promise<number>;
  readonly shutdown: () => Promise<void>;
};

const repositoryContract = (setup: () => Promise<ContractDeps>): void => {
  let deps: ContractDeps;
  let tenants: ContractDeps['tenants'];
  let users: ContractDeps['users'];
  let products: ContractDeps['products'];
  let orders: ContractDeps['orders'];

  let sequence = 0;
  const nextId = (prefix: string): string => `${prefix}-${++sequence}`;

  let tenantId: TenantExistedId;

  const createUser = async (
    overrides: Partial<{ email: string; name: string }> = {},
  ): Promise<User> => {
    const created = await users.save({
      pre: null,
      input: {
        id: nextId('user'),
        tenant_id: tenantId,
        email: overrides.email ?? `${nextId('mail')}@example.com`,
        name: overrides.name ?? 'Alice',
        nickname: null,
      },
    });
    return created._unsafeUnwrap();
  };

  const createOrder = async (
    customer: UserExistedId,
    itemNames: readonly string[],
  ): Promise<Order> => {
    const id = nextId('order');
    const created = await orders.save({
      pre: null,
      input: {
        id,
        customer_id: customer,
        revision: 0,
        items: itemNames.map((name) => ({ id: nextId('item'), order_id: id, name })),
      },
    });
    return created._unsafeUnwrap();
  };

  beforeAll(async () => {
    deps = await setup();
    ({ tenants, users, products, orders } = deps);
    const created = await tenants.save({
      pre: null,
      input: { id: nextId('tenant'), name: 'acme' },
    });
    tenantId = created._unsafeUnwrap().id;
  });

  afterAll(async () => {
    await deps.shutdown();
  });

  describe('reading by id', () => {
    it('isExisted returns NOT_EXIST for a missing row, which is not an error', async () => {
      const result = await users.isExisted('missing');
      expect(result._unsafeUnwrap()).toBe(NOT_EXIST);
    });

    it('getById returns the whole model without the columns excluded from it', async () => {
      const user = await createUser({ name: 'Bob' });
      const existed = (await users.isExisted(user.id))._unsafeUnwrap();
      expect(existed).toBe(user.id);
      if (existed === NOT_EXIST) throw new Error('unreachable');

      const read = (await users.getById(existed))._unsafeUnwrap();
      expect(read).toEqual({
        id: user.id,
        tenant_id: tenantId,
        email: user.email,
        name: 'Bob',
        nickname: null,
      });
      expect(read).not.toHaveProperty('created_at');
    });

    it('getById returns EntityNotFoundError when the row is gone', async () => {
      const user = await createUser();
      await users.delete(user);
      const result = await users.getById(user.id);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(EntityNotFoundError);
    });

    it('returns the rows of the included tables with the model', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A', 'B']);
      const read = (await orders.getById(created.id))._unsafeUnwrap();
      expect(read.items.map((item) => item.name).sort()).toEqual(['A', 'B']);
      expect(read.revision).toBe(0);
    });
  });

  describe('number of queries', () => {
    it('reads a domain with its included rows in one query', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A', 'B']);
      expect(await deps.queriesDuring(async () => orders.getById(created.id))).toBe(1);
    });

    it('reads every domain found by a foreign key in one query', async () => {
      const customer = await createUser();
      await createOrder(customer.id, ['A']);
      await createOrder(customer.id, ['B', 'C']);
      expect(await deps.queriesDuring(async () => orders.findByCustomerId(customer.id))).toBe(1);
    });
  });

  describe('checking a unique key', () => {
    it('returns the confirmed id when the key exists', async () => {
      const user = await createUser({ email: 'taken@example.com' });
      const result = (await users.isExistedByEmail('taken@example.com'))._unsafeUnwrap();
      expect(result).toEqual({ id: user.id });
    });

    it('returns NOT_EXIST with the key when no row has it', async () => {
      const result = (await users.isExistedByEmail('free@example.com'))._unsafeUnwrap();
      expect(result).toEqual({ id: NOT_EXIST, email: 'free@example.com' });
    });

    it('takes every column of a key made of several columns', async () => {
      const created = (
        await products.save({
          pre: null,
          input: { id: nextId('product'), tenant_id: tenantId, slug: 'pen' },
        })
      )._unsafeUnwrap();
      const found = (
        await products.isExistedByTenantIdAndSlug({ tenant_id: tenantId, slug: 'pen' })
      )._unsafeUnwrap();
      expect(found).toEqual({ id: created.id });
    });
  });

  describe('reading by foreign key', () => {
    it('returns every model that points to the confirmed id', async () => {
      const other = (
        await tenants.save({ pre: null, input: { id: nextId('tenant'), name: 'other' } })
      )._unsafeUnwrap();
      const saved = (
        await users.save({
          pre: null,
          input: {
            id: nextId('user'),
            tenant_id: other.id,
            email: 'only@other.example',
            name: 'Carol',
            nickname: null,
          },
        })
      )._unsafeUnwrap();
      const found = (await users.findByTenantId(other.id))._unsafeUnwrap();
      expect(found).toEqual([saved]);
    });
  });

  describe('saving', () => {
    it('updates the model from pre to input', async () => {
      const user = await createUser({ name: 'Before' });
      const saved = (
        await users.save({ pre: user, input: { ...user, name: 'After' } })
      )._unsafeUnwrap();
      expect(saved.name).toBe('After');
      expect((await users.getById(user.id))._unsafeUnwrap().name).toBe('After');
    });

    it('returns DbError and writes nothing when input has another id than pre', async () => {
      const first = await createUser({ name: 'First' });
      const second = await createUser({ name: 'Second' });

      const result = await users.save({
        pre: first,
        input: { ...first, id: second.id, name: 'Changed' },
      });

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(DbError);
      expect((await users.getById(first.id))._unsafeUnwrap().name).toBe('First');
      expect((await users.getById(second.id))._unsafeUnwrap().name).toBe('Second');
    });

    it('links the included rows to the model they are in, whatever their link column says', async () => {
      const customer = await createUser();
      const other = await createOrder(customer.id, []);
      const id = nextId('order');
      const created = (
        await orders.save({
          pre: null,
          input: {
            id,
            customer_id: customer.id,
            revision: 0,
            items: [{ id: nextId('item'), order_id: other.id, name: 'A' }],
          },
        })
      )._unsafeUnwrap();
      const input = {
        ...created,
        items: [...created.items, { id: nextId('item'), order_id: other.id, name: 'B' }],
      };
      const saved = (await orders.save({ pre: created, input }))._unsafeUnwrap();

      expect(saved.items.map((item) => item.order_id)).toEqual([id, id]);
      expect(await deps.itemsOf(id)).toHaveLength(2);
      expect(await deps.itemsOf(other.id)).toEqual([]);
    });

    it('writes only the included rows that were added, removed or changed', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A', 'B', 'C']);
      const [itemA, itemB, itemC] = [...created.items].sort((x, y) => x.name.localeCompare(y.name));
      const input: Order = {
        ...created,
        items: [
          ...created.items
            .filter((item) => item.id !== itemC?.id)
            .map((item) => (item.id === itemB?.id ? { ...item, name: 'B2' } : item)),
          { id: nextId('item'), order_id: created.id, name: 'D' },
        ],
      };

      const saved = (await orders.save({ pre: created, input }))._unsafeUnwrap();

      expect(saved.items.map((item) => item.name).sort()).toEqual(['A', 'B2', 'D']);
      const rows = await deps.itemsOf(created.id);
      expect(rows.find((row) => row.id === itemA?.id)?.name).toBe('A');
      expect(rows.some((row) => row.id === itemC?.id)).toBe(false);
    });
  });

  describe('optimistic lock', () => {
    it('advances the lock column of the root even when only an included row changed', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A']);
      const input = { ...created, items: created.items.map((item) => ({ ...item, name: 'A2' })) };
      const saved = (await orders.save({ pre: created, input }))._unsafeUnwrap();
      expect(saved.revision).toBe(created.revision + 1);
    });

    it('returns ConflictError and writes nothing when another process wrote after the read', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A']);
      (await orders.save({ pre: created, input: { ...created, items: [] } }))._unsafeUnwrap();

      const stale = await orders.save({
        pre: created,
        input: {
          ...created,
          items: [...created.items, { id: nextId('item'), order_id: created.id, name: 'late' }],
        },
      });

      expect(stale._unsafeUnwrapErr()).toBeInstanceOf(ConflictError);
      const items = await deps.itemsOf(created.id);
      expect(items).toEqual([]);
    });

    it('delete returns ConflictError for a stale model and keeps the domain', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A']);
      (await orders.save({ pre: created, input: created }))._unsafeUnwrap();

      const result = await orders.delete(created);

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConflictError);
      expect(await deps.orderExists(created.id)).toBe(true);
    });
  });

  describe('saving inside an outer transaction', () => {
    it('rolls back the saves of every domain when the work throws', async () => {
      const userId = nextId('user');
      const failure = new Error('after the saves');

      const work = deps.inTransaction(async () => {
        (
          await tenants.save({ pre: null, input: { id: nextId('tenant'), name: 'rolled back' } })
        )._unsafeUnwrap();
        const input = {
          id: userId,
          tenant_id: tenantId,
          email: `${userId}@example.com`,
          name: 'Bob',
          nickname: null,
        };
        (await users.save({ pre: null, input }))._unsafeUnwrap();
        throw failure;
      });

      await expect(work).rejects.toBe(failure);
      expect((await users.isExisted(userId))._unsafeUnwrap()).toBe(NOT_EXIST);
    });

    it('keeps the earlier saves when a later save returns ConflictError, which writes nothing', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A']);
      (await orders.save({ pre: created, input: created }))._unsafeUnwrap();

      const renamed = await deps.inTransaction(async () => {
        const saved = (
          await users.save({ pre: customer, input: { ...customer, name: 'Renamed' } })
        )._unsafeUnwrap();
        const stale = await orders.save({ pre: created, input: { ...created, items: [] } });
        expect(stale._unsafeUnwrapErr()).toBeInstanceOf(ConflictError);
        return saved;
      });

      expect((await users.getById(renamed.id))._unsafeUnwrap().name).toBe('Renamed');
      expect(await deps.itemsOf(created.id)).toHaveLength(1);
    });
  });

  describe('deleting', () => {
    it('deletes the rows of the included tables with the model', async () => {
      const customer = await createUser();
      const created = await createOrder(customer.id, ['A', 'B']);
      (await orders.delete(created))._unsafeUnwrap();
      expect((await orders.isExisted(created.id))._unsafeUnwrap()).toBe(NOT_EXIST);
      expect(await deps.itemsOf(created.id)).toEqual([]);
    });
  });

  describe('staging', () => {
    const newUser = (email: string) => ({
      id: nextId('user'),
      tenant_id: tenantId,
      email,
      name: 'Staged',
      nickname: null,
    });

    it('lets later reads see a staged model as if it were stored', async () => {
      await withStagingScope(async () => {
        const input = newUser('staged@example.com');
        stage('User', { pre: null, input })._unsafeUnwrap();

        const existed = (await users.isExisted(input.id))._unsafeUnwrap();
        expect(existed).toBe(input.id);
        expect((await users.getById(input.id as UserExistedId))._unsafeUnwrap()).toEqual(input);
        expect((await users.isExistedByEmail('staged@example.com'))._unsafeUnwrap()).toEqual({
          id: input.id,
        });
      });
      expect((await users.isExistedByEmail('staged@example.com'))._unsafeUnwrap().id).toBe(
        NOT_EXIST,
      );
    });

    it('does not show staged models to findBy of a foreign key', async () => {
      await withStagingScope(async () => {
        const other = (
          await tenants.save({ pre: null, input: { id: nextId('tenant'), name: 't' } })
        )._unsafeUnwrap();
        stage('User', {
          pre: null,
          input: { ...newUser('fk@example.com'), tenant_id: other.id },
        })._unsafeUnwrap();
        expect((await users.findByTenantId(other.id))._unsafeUnwrap()).toEqual([]);
      });
    });

    it('treats a model staged for deletion as missing', async () => {
      const user = await createUser({ email: 'to-delete@example.com' });
      await withStagingScope(async () => {
        stageDelete('User', user)._unsafeUnwrap();
        expect((await users.isExisted(user.id))._unsafeUnwrap()).toBe(NOT_EXIST);
        expect((await users.getById(user.id))._unsafeUnwrapErr()).toBeInstanceOf(
          EntityNotFoundError,
        );
        expect((await users.isExistedByEmail('to-delete@example.com'))._unsafeUnwrap().id).toBe(
          NOT_EXIST,
        );
      });
    });

    it('returns StagingDuplicateError for the same primary key or unique key', async () => {
      await withStagingScope(async () => {
        const first = newUser('dup@example.com');
        stage('User', { pre: null, input: first })._unsafeUnwrap();
        expect(stage('User', { pre: null, input: first })._unsafeUnwrapErr()).toBeInstanceOf(
          StagingDuplicateError,
        );
        expect(
          stage('User', { pre: null, input: newUser('dup@example.com') })._unsafeUnwrapErr(),
        ).toBeInstanceOf(StagingDuplicateError);
      });
    });

    it('does not treat keys with NULL as duplicates', async () => {
      const products_ = [nextId('product'), nextId('product')];
      await withStagingScope(async () => {
        for (const id of products_) {
          stage('User', {
            pre: null,
            input: { ...newUser(`${id}@example.com`), nickname: null },
          })._unsafeUnwrap();
        }
      });
    });

    it('carries the scope into asynchronous calls', async () => {
      const input = newUser('async@example.com');
      const check = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return (await users.isExisted(input.id))._unsafeUnwrap();
      };
      await withStagingScope(async () => {
        stage('User', { pre: null, input })._unsafeUnwrap();
        expect(await check()).toBe(input.id);
      });
    });

    it('throws outside a scope and when a scope is nested', async () => {
      expect(() => stage('User', { pre: null, input: newUser('outside@example.com') })).toThrow();
      await withStagingScope(async () => {
        expect(() => withStagingScope(async () => undefined)).toThrow();
      });
    });
  });
};

// The application gets async context from its adapter; the shared Vitest setup enables it here.
describe('SQLite', () => {
  repositoryContract(async () => {
    const runtime = await createApp([]).createRuntime();
    const db = await runtime.get(SqliteDrizzleService);
    const { order, orderItem } = sqliteSchema;
    return {
      tenants: await runtime.get(SqliteTenants),
      users: await runtime.get(SqliteUsers),
      products: await runtime.get(SqliteProducts),
      orders: await runtime.get(SqliteOrders),
      itemsOf: (orderId) =>
        db.client.select().from(orderItem).where(eq(orderItem.order_id, orderId)),
      orderExists: async (orderId) =>
        (await db.client.select().from(order).where(eq(order.id, orderId))).length === 1,
      inTransaction: (fn) => db.withTransaction(fn),
      queriesDuring: async (fn) => {
        const before = db.executedQueries;
        await fn();
        return db.executedQueries - before;
      },
      shutdown: () => runtime.shutdown(),
    };
  });
});

describe('PostgreSQL', () => {
  repositoryContract(async () => {
    const runtime = await createApp([]).createRuntime();
    const db = await runtime.get(PgDrizzleService);
    const { order, orderItem } = pgSchema;
    return {
      tenants: await runtime.get(PgTenants),
      users: await runtime.get(PgUsers),
      products: await runtime.get(PgProducts),
      orders: await runtime.get(PgOrders),
      itemsOf: (orderId) =>
        db.client.select().from(orderItem).where(eq(orderItem.order_id, orderId)),
      orderExists: async (orderId) =>
        (await db.client.select().from(order).where(eq(order.id, orderId))).length === 1,
      inTransaction: (fn) => db.withTransaction(fn),
      queriesDuring: async (fn) => {
        const before = db.executedQueries;
        await fn();
        return db.executedQueries - before;
      },
      shutdown: () => runtime.shutdown(),
    };
  });
});

describe('MySQL', () => {
  repositoryContract(async () => {
    const runtime = await createApp([]).createRuntime();
    const db = await runtime.get(MySqlDrizzleService);
    const { order, orderItem } = mysqlSchema;
    return {
      tenants: await runtime.get(MySqlTenants),
      users: await runtime.get(MySqlUsers),
      products: await runtime.get(MySqlProducts),
      orders: await runtime.get(MySqlOrders),
      itemsOf: (orderId) =>
        db.client.select().from(orderItem).where(eq(orderItem.order_id, orderId)),
      orderExists: async (orderId) =>
        (await db.client.select().from(order).where(eq(order.id, orderId))).length === 1,
      inTransaction: (fn) => db.withTransaction(fn),
      queriesDuring: async (fn) => {
        const before = db.executedQueries;
        await fn();
        return db.executedQueries - before;
      },
      shutdown: () => runtime.shutdown(),
    };
  });
});
