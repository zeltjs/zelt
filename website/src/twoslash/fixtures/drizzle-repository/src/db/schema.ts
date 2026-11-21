// The guide's schema, with the tables its other examples read and write.
import 'drizzle-metadata/register';
import '@zeltjs/drizzle-repository/metadata';

import { relations, sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const customer = sqliteTable('customer', {
  id: text().primaryKey(),
});

export const user = sqliteTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
});

export const order = sqliteTable('order', {
  id: text().primaryKey(),
  customer_id: text()
    .notNull()
    .references(() => customer.id),
  revision: integer().notNull().default(0).meta({ optimisticLock: true }),
  created_at: integer().notNull().default(sql`(unixepoch())`).meta({ excludedFromModel: true }),
});

export const orderItem = sqliteTable('order_item', {
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
