import 'drizzle-metadata/register';
import '@zeltjs/drizzle-repository/metadata';

import { relations, sql } from 'drizzle-orm';
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const tenant = sqliteTable('tenant', {
  id: text().primaryKey(),
  name: text().notNull(),
});

export const user = sqliteTable('user', {
  id: text().primaryKey(),
  tenant_id: text()
    .notNull()
    .references(() => tenant.id),
  email: text().notNull().unique(),
  name: text().notNull(),
  nickname: text().unique(),
  created_at: integer().notNull().default(sql`(unixepoch())`).meta({ excludedFromModel: true }),
});

export const product = sqliteTable(
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

export const order = sqliteTable('order', {
  id: text().primaryKey(),
  customer_id: text()
    .notNull()
    .references(() => user.id),
  revision: integer().notNull().default(0).meta({ optimisticLock: true }),
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

// A child keyed by a date, with a column that only the database writes.
export const timeline = sqliteTable('timeline', { id: text().primaryKey() });

export const timelineEvent = sqliteTable('timeline_event', {
  at: integer({ mode: 'timestamp_ms' }).primaryKey(),
  timeline_id: text()
    .notNull()
    .references(() => timeline.id),
  note: text().notNull(),
  recorded_by: text().notNull().default('app').meta({ excludedFromModel: true }),
});

export const timelineRelations = relations(timeline, ({ many }) => ({
  events: many(timelineEvent).meta({ includedInDomain: true }),
}));

export const timelineEventRelations = relations(timelineEvent, ({ one }) => ({
  timeline: one(timeline, { fields: [timelineEvent.timeline_id], references: [timeline.id] }),
}));

export const ddl = [
  `CREATE TABLE tenant (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE user (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenant(id), email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, nickname TEXT UNIQUE, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE product (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenant(id), slug TEXT NOT NULL, UNIQUE (tenant_id, slug))`,
  `CREATE TABLE "order" (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES user(id), revision INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE order_item (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES "order"(id), name TEXT NOT NULL)`,
  `CREATE TABLE timeline (id TEXT PRIMARY KEY)`,
  `CREATE TABLE timeline_event (at INTEGER PRIMARY KEY, timeline_id TEXT NOT NULL REFERENCES timeline(id), note TEXT NOT NULL, recorded_by TEXT NOT NULL DEFAULT 'app')`,
];
