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

type Database = LibSQLDatabase<typeof schema>;

@Injectable()
export class DrizzleService extends DatabaseService<
  Database,
  { client: Database; connection: Client }
> {
  async setup() {
    const connection = createClient({
      url: `file:${join(mkdtempSync(join(tmpdir(), 'zelt-app-')), 'app.db')}`,
    });
    await connection.execute('CREATE TABLE tenant (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    return { client: drizzle(connection, { schema }), connection };
  }

  transaction<T>(client: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
    return client.transaction((tx) => fn(tx as unknown as Database));
  }

  async shutdown() {
    this.ready.connection.close();
  }
}
