import type { Client, ResultSet } from '@libsql/client';
import { createClient } from '@libsql/client';
import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import { drizzle } from 'drizzle-orm/libsql';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import * as schema from './schema';

// The common type of the client and its transactions, so one service type covers both.
type Database = BaseSQLiteDatabase<'async', ResultSet, typeof schema>;

// libsql runs a transaction asynchronously, as the repositories await their work inside it.
@Injectable()
export class DrizzleService extends DatabaseService<
  Database,
  { client: Database; connection: Client }
> {
  async setup() {
    const connection = createClient({ url: 'file:app.db' });
    return { client: drizzle(connection, { schema }), connection };
  }

  transaction<T>(client: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }

  async shutdown(): Promise<void> {
    this.ready.connection.close();
  }
}
