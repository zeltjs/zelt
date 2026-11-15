import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

@Injectable()
export class DrizzleService extends DatabaseService<
  PostgresJsDatabase,
  { client: PostgresJsDatabase; sql: postgres.Sql }
> {
  async setup() {
    const sql = postgres('postgres://localhost/zelt');
    return { client: drizzle(sql), sql };
  }
  transaction<T>(
    client: PostgresJsDatabase,
    fn: (tx: PostgresJsDatabase) => Promise<T>,
  ): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}
