import { existsSync, mkdirSync } from 'node:fs';

import { Injectable } from '@zeltjs/core';
import type { Disposable } from '@zeltjs/core';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

@Injectable()
export class DrizzleService implements Disposable {
  private sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;

  constructor() {
    if (!existsSync('./data')) {
      mkdirSync('./data', { recursive: true });
    }
    this.sqlite = new Database('./data/todo.db');
    this.db = drizzle(this.sqlite, { schema });
    this.initSchema();
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

  dispose() {
    this.sqlite.close();
  }
}
