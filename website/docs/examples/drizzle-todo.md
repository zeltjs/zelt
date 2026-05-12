---
---

# Drizzle Todo

A simple Todo API using Drizzle ORM with SQLite.

**Location:** `examples/drizzle-todo`

## Features

- CRUD operations with Drizzle ORM
- Request validation with Valibot
- SQLite database with better-sqlite3
- Disposable pattern for cleanup

## Running

```bash
cd examples/drizzle-todo
pnpm install
pnpm dev
```

## Key Code

**Controller with validation:**

```typescript
import { Controller, Get, Post, inject, pathParam, validated } from '@zeltjs/core';
import * as v from 'valibot';

const CreateTodoBody = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
});

@Controller('/todos')
class TodoController {
  constructor(private todoService = inject(TodoService)) {}

  @Get('/')
  findAll() {
    return this.todoService.findAll();
  }

  @Post('/')
  create(body = validated(CreateTodoBody), res = response()) {
    const todo = this.todoService.create({ title: body.title });
    return res.json(todo, 201);
  }
}
```

**Drizzle service with Disposable:**

```typescript
import { Injectable } from '@zeltjs/core';
import type { Disposable } from '@zeltjs/core';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

@Injectable()
class DrizzleService implements Disposable {
  private sqlite: Database.Database;
  readonly db;

  constructor() {
    this.sqlite = new Database('./data/todo.db');
    this.db = drizzle(this.sqlite, { schema });
  }

  dispose() {
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
