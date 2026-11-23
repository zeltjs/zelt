import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { inject } from 'vitest';

import * as schema from './schema';

type Database = NodePgDatabase<typeof schema>;

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
    const connection = new Pool({ connectionString: inject('postgresUrl') });
    for (const statement of schema.ddl) await connection.query(statement);
    return { client: drizzle(connection, { schema, logger: this.recordingLogger }), connection };
  }

  transaction<T>(client: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
    return client.transaction((tx) => fn(tx as unknown as Database));
  }

  async shutdown() {
    await this.ready.connection.end();
  }
}
