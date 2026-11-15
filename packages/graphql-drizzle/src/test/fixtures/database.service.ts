import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import SQLite from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export const queries: string[] = [];

@Injectable()
export class DrizzleService extends DatabaseService<
  BetterSQLite3Database,
  {
    client: BetterSQLite3Database;
    connection: SQLite.Database;
  }
> {
  async setup(): Promise<{ client: BetterSQLite3Database; connection: SQLite.Database }> {
    const connection = new SQLite(':memory:');
    connection.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT NOT NULL, author_id TEXT NOT NULL, reviewer_id TEXT, created_at INTEGER NOT NULL);
      INSERT INTO users VALUES ('u1', '太郎', '山田', 'secret'), ('u2', '花子', '佐藤', ''), ('u3', 'Empty', 'User', '');
      INSERT INTO posts VALUES ('p020', 'Second', 'u1', 'u2', 1700000000), ('p003', 'First', 'u1', NULL, 1700000000), ('p008', 'Other', 'u2', NULL, 1700000000), ('p099', 'Dangling', 'missing', NULL, 1700000000);
    `);
    const client = drizzle(connection, { logger: { logQuery: (sql) => queries.push(sql) } });
    return { client, connection };
  }

  async transaction<T>(
    client: BetterSQLite3Database,
    fn: (tx: BetterSQLite3Database) => Promise<T>,
  ): Promise<T> {
    // better-sqlite3 transactions are synchronous; bracket the async callback explicitly.
    client.run('BEGIN');
    try {
      const tx = drizzle(this.ready.connection, {
        logger: { logQuery: (sql) => queries.push(`tx: ${sql}`) },
      });
      const result = await fn(tx);
      client.run('COMMIT');
      return result;
    } catch (error) {
      client.run('ROLLBACK');
      throw error;
    }
  }

  async shutdown() {
    this.ready.connection.close();
  }
}
