import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { Injectable } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

type Database = LibSQLDatabase<typeof schema.schemaRelations>;

@Injectable()
export class DrizzleService extends DatabaseService<
  Database,
  { client: Database; connection: Client }
> {
  executedQueries = 0;
  private readonly countingLogger = {
    logQuery: () => {
      this.executedQueries += 1;
    },
  };

  async setup() {
    // A file, because libsql opens a separate connection for a transaction and ":memory:" would not be shared.
    const directory = mkdtempSync(join(tmpdir(), 'drizzle-repository-'));
    const connection = createClient({ url: `file:${join(directory, 'test.db')}` });
    for (const statement of schema.ddl) await connection.execute(statement);
    return {
      client: drizzle({
        client: connection,
        relations: schema.schemaRelations,
        logger: this.countingLogger,
      }),
      connection,
    };
  }

  transaction<T>(client: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
    return client.transaction((tx) => fn(tx as unknown as Database));
  }

  async shutdown() {
    this.ready.connection.close();
  }
}
