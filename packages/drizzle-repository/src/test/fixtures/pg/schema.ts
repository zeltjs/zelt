import 'drizzle-metadata/register';
import '@zeltjs/drizzle-repository/metadata';

import { relations } from 'drizzle-orm';
import { customType, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

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

// A child keyed by a date, with a column that only the database writes.
export const timeline = pgTable('timeline', { id: text().primaryKey() });

export const timelineEvent = pgTable('timeline_event', {
  at: timestamp({ withTimezone: true, precision: 3 }).primaryKey(),
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

// Relational queries read the rows of an included table through JSON, which carries bytea as \x-prefixed hex.
const bytes = customType<{ data: Buffer; driverData: Buffer | string }>({
  dataType: () => 'bytea',
  fromDriver: (value) => (typeof value === 'string' ? Buffer.from(value.slice(2), 'hex') : value),
});

// A child keyed by bytes, with a column that only the database writes.
export const archive = pgTable('archive', { id: text().primaryKey() });

export const archiveEntry = pgTable('archive_entry', {
  digest: bytes().primaryKey(),
  archive_id: text()
    .notNull()
    .references(() => archive.id),
  name: text().notNull(),
  recorded_by: text().notNull().default('app').meta({ excludedFromModel: true }),
});

export const archiveRelations = relations(archive, ({ many }) => ({
  entries: many(archiveEntry).meta({ includedInDomain: true }),
}));

export const archiveEntryRelations = relations(archiveEntry, ({ one }) => ({
  archive: one(archive, { fields: [archiveEntry.archive_id], references: [archive.id] }),
}));

export const ddl = [
  `CREATE TABLE tenant (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE "user" (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenant(id), email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, nickname TEXT UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT now())`,
  `CREATE TABLE product (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenant(id), slug TEXT NOT NULL, UNIQUE (tenant_id, slug))`,
  `CREATE TABLE "order" (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES "user"(id), revision INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE order_item (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES "order"(id), name TEXT NOT NULL)`,
  `CREATE TABLE timeline (id TEXT PRIMARY KEY)`,
  `CREATE TABLE timeline_event (at TIMESTAMPTZ(3) PRIMARY KEY, timeline_id TEXT NOT NULL REFERENCES timeline(id), note TEXT NOT NULL, recorded_by TEXT NOT NULL DEFAULT 'app')`,
  `CREATE TABLE archive (id TEXT PRIMARY KEY)`,
  `CREATE TABLE archive_entry (digest BYTEA PRIMARY KEY, archive_id TEXT NOT NULL REFERENCES archive(id), name TEXT NOT NULL, recorded_by TEXT NOT NULL DEFAULT 'app')`,
];
