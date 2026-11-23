import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import type { Pool } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import { inject } from 'vitest';

import * as schema from './schema';

type Database = MySql2Database<typeof schema>;

@Injectable()
export class DrizzleService extends DatabaseService<
  Database,
  { client: Database; connection: Pool }
> {
  readonly executedStatements: string[] = [];
  private readonly recordingLogger = {
    logQuery: (query: string) => {
      this.executedStatements.push(query);
    },
  };

  async setup() {
    const connection = createPool(inject('mysqlUrl'));
    for (const statement of schema.ddl) await connection.query(statement);
    return {
      client: drizzle(connection, { schema, mode: 'default', logger: this.recordingLogger }),
      connection,
    };
  }

  transaction<T>(client: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
    return client.transaction((tx) => fn(tx as unknown as Database));
  }

  async shutdown() {
    await this.ready.connection.end();
  }
}
