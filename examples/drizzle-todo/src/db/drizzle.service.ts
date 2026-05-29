import { existsSync, mkdirSync } from 'node:fs';
import type { Lifecycle } from '@zeltjs/core';
import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

@Injectable()
export class DrizzleService implements Lifecycle {
  private sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;

  constructor(lifecycle = inject(LifecycleManager)) {
    if (!existsSync('./data')) {
      mkdirSync('./data', { recursive: true });
    }
    this.sqlite = new Database('./data/todo.db');
    this.db = drizzle(this.sqlite, { schema });
    this.initSchema();
    lifecycle.register(this);
  }

  private initSchema() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.sqlite.close();
  }
}
