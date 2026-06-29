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
