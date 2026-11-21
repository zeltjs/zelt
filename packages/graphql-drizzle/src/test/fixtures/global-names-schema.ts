import { relations } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import 'drizzle-metadata/register';
import '../../metadata';

// Models named after the globals the generated module refers to. Relations cover the
// many, required-one and nullable-one code paths.
export const pick = sqliteTable('pick', { id: text().primaryKey(), label: text() }).meta({
  graphqlName: 'Pick',
});
export const promise = sqliteTable('promise', {
  id: text().primaryKey(),
  pickId: text('pick_id')
    .notNull()
    .references(() => pick.id),
  mapId: text('map_id').references(() => map.id),
}).meta({ graphqlName: 'Promise' });
export const map = sqliteTable('map', { id: text().primaryKey() }).meta({ graphqlName: 'Map' });
export const readonlyMap = sqliteTable('readonly_map', { id: text().primaryKey() }).meta({
  graphqlName: 'ReadonlyMap',
});
export const error = sqliteTable('error', { id: text().primaryKey() }).meta({
  graphqlName: 'Error',
});
export const symbol = sqliteTable('symbol', { id: text().primaryKey() }).meta({
  graphqlName: 'Symbol',
});
export const globalThisTable = sqliteTable('global_this', { id: text().primaryKey() }).meta({
  graphqlName: 'globalThis',
});

// Export names that are not plain identifiers still need a valid, distinct row type alias.
export const $dollar = sqliteTable('dollar', { id: text().primaryKey() });
const hyphenated = sqliteTable('hyphenated', { id: text().primaryKey() });

export { hyphenated as 'hyphen-ated' };

export const pickRelations = relations(pick, ({ many }) => ({ promises: many(promise) }));
export const promiseRelations = relations(promise, ({ one }) => ({
  pick: one(pick, { fields: [promise.pickId], references: [pick.id] }),
  map: one(map, { fields: [promise.mapId], references: [map.id] }),
}));
