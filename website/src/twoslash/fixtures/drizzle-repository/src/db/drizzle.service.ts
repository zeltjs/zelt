import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

type Database = BetterSQLite3Database<typeof schema>;

@Injectable()
export class DrizzleService extends DatabaseService<Database, { client: Database }> {
  async setup() {
    return { client: drizzle('app.db', { schema }) };
  }
  transaction<T>(client: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
    return client.transaction((tx) => fn(tx as unknown as Database));
  }
  async shutdown(): Promise<void> {
    this.ready.client.$client.close();
  }
}
