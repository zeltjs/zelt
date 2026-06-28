---
---

# Drizzle Todo

A simple Todo API using Drizzle ORM with SQLite.

**Location:** `examples/drizzle-todo`

## Features

- CRUD operations with Drizzle ORM
- Request validation with Valibot
- SQLite database with better-sqlite3
- Lifecycle hooks for connection cleanup

## Running

```bash
cd examples/drizzle-todo
pnpm install
pnpm dev
```

## Key Code

**Controller with validation** (`src/todo/todo.controller.ts`):

```typescript source=examples/drizzle-todo/src/todo/todo.controller.ts
import {
  Controller,
  Delete,
  Get,
  HTTPException,
  inject,
  Patch,
  Post,
  request,
  response,
} from '@zeltjs/core';
import * as v from 'valibot';

import type { Todo } from '../db/schema';

import { TodoService } from './todo.service';

const CreateTodoBody = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
});

const UpdateTodoBody = v.object({
  title: v.optional(v.pipe(v.string(), v.minLength(1))),
  completed: v.optional(v.boolean()),
});

@Controller('/todos')
export class TodoController {
  constructor(private todoService = inject(TodoService)) {}

  @Get('/')
  findAll(): Todo[] {
    return this.todoService.findAll();
  }

  @Get('/:id')
  findById(req = request()): Todo {
    const todo = this.todoService.findById(Number(req.pathParam('id')));
    if (!todo) {
      throw new HTTPException(404, { message: 'Todo not found' });
    }
    return todo;
  }

  @Post('/')
  async create(req = request(CreateTodoBody), res = response()) {
    const body = await req.body();
    const todo = this.todoService.create({ title: body.title });
    return res.json(todo, 201);
  }

  @Patch('/:id')
  async update(req = request(UpdateTodoBody)): Promise<Todo> {
    const todo = this.todoService.update(Number(req.pathParam('id')), await req.body());
    if (!todo) {
      throw new HTTPException(404, { message: 'Todo not found' });
    }
    return todo;
  }

  @Delete('/:id')
  delete(req = request()) {
    const deleted = this.todoService.delete(Number(req.pathParam('id')));
    if (!deleted) {
      throw new HTTPException(404, { message: 'Todo not found' });
    }
    return new Response(null, { status: 204 });
  }
}
```

**Drizzle service with Lifecycle** (`src/db/drizzle.service.ts`):

```typescript source=examples/drizzle-todo/src/db/drizzle.service.ts
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
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/todos` | List all todos |
| GET | `/todos/:id` | Get a todo by ID |
| POST | `/todos` | Create a new todo |
| PATCH | `/todos/:id` | Update a todo |
| DELETE | `/todos/:id` | Delete a todo |
