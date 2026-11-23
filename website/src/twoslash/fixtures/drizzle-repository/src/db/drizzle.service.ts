import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

type Database = LibSQLDatabase<typeof schema>;

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
    return client.transaction((tx) => fn(tx as unknown as Database));
  }

  async shutdown(): Promise<void> {
    this.ready.connection.close();
  }
}
