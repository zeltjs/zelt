import 'drizzle-metadata/register';
import '@zeltjs/drizzle-repository/metadata';

import { relations } from 'drizzle-orm';
import {
  customType,
  datetime,
  int,
  mysqlTable,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';

// MySQL cannot index a TEXT column without a length, so keys are VARCHAR.
const key = () => varchar({ length: 64 });

export const tenant = mysqlTable('tenant', {
  id: key().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
});

export const user = mysqlTable('user', {
  id: key().primaryKey(),
  tenant_id: key()
    .notNull()
    .references(() => tenant.id),
  email: key().notNull().unique(),
  name: varchar({ length: 255 }).notNull(),
  nickname: key().unique(),
  created_at: timestamp().notNull().defaultNow().meta({ excludedFromModel: true }),
});

export const product = mysqlTable(
  'product',
  {
    id: key().primaryKey(),
    tenant_id: key()
      .notNull()
      .references(() => tenant.id),
    slug: key().notNull(),
  },
  (table) => [unique().on(table.tenant_id, table.slug)],
);

export const order = mysqlTable('order', {
  id: key().primaryKey(),
  customer_id: key()
    .notNull()
    .references(() => user.id),
  revision: int().notNull().default(0).meta({ optimisticLock: true }),
});

export const orderItem = mysqlTable('order_item', {
  id: key().primaryKey(),
  order_id: key()
    .notNull()
    .references(() => order.id),
  name: varchar({ length: 255 }).notNull(),
});

export const orderRelations = relations(order, ({ many }) => ({
  items: many(orderItem).meta({ includedInDomain: true }),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.order_id], references: [order.id] }),
}));

// A child keyed by a date, with a column that only the database writes.
export const timeline = mysqlTable('timeline', { id: key().primaryKey() });

export const timelineEvent = mysqlTable('timeline_event', {
  at: datetime({ mode: 'date', fsp: 3 }).primaryKey(),
  timeline_id: key()
    .notNull()
    .references(() => timeline.id),
  note: varchar({ length: 255 }).notNull(),
  recorded_by: varchar({ length: 64 }).notNull().default('app').meta({ excludedFromModel: true }),
});

export const timelineRelations = relations(timeline, ({ many }) => ({
  events: many(timelineEvent).meta({ includedInDomain: true }),
}));

export const timelineEventRelations = relations(timelineEvent, ({ one }) => ({
  timeline: one(timeline, { fields: [timelineEvent.timeline_id], references: [timeline.id] }),
}));

// drizzle's binary() reads strings. Relational queries read the rows of an included table through
// JSON, which carries binary values as base64 behind a type prefix.
const bytes = customType<{ data: Buffer; driverData: Buffer | string }>({
  dataType: () => 'varbinary(32)',
  fromDriver: (value) =>
    typeof value === 'string'
      ? Buffer.from(value.replace(/^base64:type\d+:/, ''), 'base64')
      : value,
});

// A child keyed by bytes, with a column that only the database writes.
export const archive = mysqlTable('archive', { id: key().primaryKey() });

export const archiveEntry = mysqlTable('archive_entry', {
  digest: bytes().primaryKey(),
  archive_id: key()
    .notNull()
    .references(() => archive.id),
  name: varchar({ length: 255 }).notNull(),
  recorded_by: varchar({ length: 64 }).notNull().default('app').meta({ excludedFromModel: true }),
});

export const archiveRelations = relations(archive, ({ many }) => ({
  entries: many(archiveEntry).meta({ includedInDomain: true }),
}));

export const archiveEntryRelations = relations(archiveEntry, ({ one }) => ({
  archive: one(archive, { fields: [archiveEntry.archive_id], references: [archive.id] }),
}));

export const ddl = [
  'CREATE TABLE tenant (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL)',
  'CREATE TABLE `user` (id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL REFERENCES tenant(id), email VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, nickname VARCHAR(64) UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (tenant_id) REFERENCES tenant(id))',
  'CREATE TABLE product (id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, slug VARCHAR(64) NOT NULL, UNIQUE (tenant_id, slug), FOREIGN KEY (tenant_id) REFERENCES tenant(id))',
  'CREATE TABLE `order` (id VARCHAR(64) PRIMARY KEY, customer_id VARCHAR(64) NOT NULL, revision INT NOT NULL DEFAULT 0, FOREIGN KEY (customer_id) REFERENCES `user`(id))',
  'CREATE TABLE order_item (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, FOREIGN KEY (order_id) REFERENCES `order`(id))',
  'CREATE TABLE timeline (id VARCHAR(64) PRIMARY KEY)',
  "CREATE TABLE timeline_event (at DATETIME(3) PRIMARY KEY, timeline_id VARCHAR(64) NOT NULL, note VARCHAR(255) NOT NULL, recorded_by VARCHAR(64) NOT NULL DEFAULT 'app', FOREIGN KEY (timeline_id) REFERENCES timeline(id))",
  'CREATE TABLE archive (id VARCHAR(64) PRIMARY KEY)',
  "CREATE TABLE archive_entry (digest VARBINARY(32) PRIMARY KEY, archive_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, recorded_by VARCHAR(64) NOT NULL DEFAULT 'app', FOREIGN KEY (archive_id) REFERENCES archive(id))",
];
