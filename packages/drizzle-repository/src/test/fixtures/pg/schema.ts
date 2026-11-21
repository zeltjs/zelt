import 'drizzle-metadata/register';
import '@zeltjs/drizzle-repository/metadata';

import { relations } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const tenant = pgTable('tenant', {
  id: text().primaryKey(),
  name: text().notNull(),
});

export const user = pgTable('user', {
  id: text().primaryKey(),
  tenant_id: text()
    .notNull()
    .references(() => tenant.id),
  email: text().notNull().unique(),
  name: text().notNull(),
  nickname: text().unique(),
  created_at: timestamp().notNull().defaultNow().meta({ excludedFromModel: true }),
});

export const product = pgTable(
  'product',
  {
    id: text().primaryKey(),
    tenant_id: text()
      .notNull()
      .references(() => tenant.id),
    slug: text().notNull(),
  },
  (table) => [unique().on(table.tenant_id, table.slug)],
);

export const order = pgTable('order', {
  id: text().primaryKey(),
  customer_id: text()
    .notNull()
    .references(() => user.id),
  revision: integer().notNull().default(0).meta({ optimisticLock: true }),
});

export const orderItem = pgTable('order_item', {
  id: text().primaryKey(),
  order_id: text()
    .notNull()
    .references(() => order.id),
  name: text().notNull(),
});

export const orderRelations = relations(order, ({ many }) => ({
  items: many(orderItem).meta({ includedInDomain: true }),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.order_id], references: [order.id] }),
}));

export const ddl = [
  `CREATE TABLE tenant (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE "user" (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenant(id), email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, nickname TEXT UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE product (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenant(id), slug TEXT NOT NULL, UNIQUE (tenant_id, slug))`,
  `CREATE TABLE "order" (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES "user"(id), revision INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE order_item (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES "order"(id), name TEXT NOT NULL)`,
];
