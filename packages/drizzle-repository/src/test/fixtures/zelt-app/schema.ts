import 'drizzle-metadata/register';
import '@zeltjs/drizzle-repository/metadata';

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tenant = sqliteTable('tenant', { id: text().primaryKey(), name: text().notNull() });
export const note = sqliteTable('note', { id: text().primaryKey(), body: text().notNull() });
