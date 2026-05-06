import { Injectable, inject } from '@zeltjs/core';
import { eq } from 'drizzle-orm';

import { DrizzleService } from '../db/drizzle.service';
import { type NewTodo, type Todo, todos } from '../db/schema';

@Injectable()
export class TodoService {
  constructor(private drizzle = inject(DrizzleService)) {}

  findAll(): Todo[] {
    return this.drizzle.db.select().from(todos).all();
  }

  findById(id: number): Todo | undefined {
    return this.drizzle.db.select().from(todos).where(eq(todos.id, id)).get();
  }

  create(data: Pick<NewTodo, 'title'>): Todo {
    const result = this.drizzle.db
      .insert(todos)
      .values({ title: data.title, createdAt: new Date() })
      .returning()
      .get();
    return result;
  }

  update(id: number, data: Partial<Pick<Todo, 'title' | 'completed'>>): Todo | undefined {
    const result = this.drizzle.db
      .update(todos)
      .set(data)
      .where(eq(todos.id, id))
      .returning()
      .get();
    return result;
  }

  delete(id: number): boolean {
    const result = this.drizzle.db.delete(todos).where(eq(todos.id, id)).returning().get();
    return result !== undefined;
  }
}
