import {
  Controller,
  Delete,
  Get,
  HTTPException,
  inject,
  Patch,
  Post,
  pathParam,
  response,
} from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
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
  findById(id = pathParam('id')): Todo {
    const todo = this.todoService.findById(Number(id));
    if (!todo) {
      throw new HTTPException(404, { message: 'Todo not found' });
    }
    return todo;
  }

  @Post('/')
  create(body = validated(CreateTodoBody), res = response()) {
    const todo = this.todoService.create({ title: body.title });
    return res.json(todo, 201);
  }

  @Patch('/:id')
  update(id = pathParam('id'), body = validated(UpdateTodoBody)): Todo {
    const todo = this.todoService.update(Number(id), body);
    if (!todo) {
      throw new HTTPException(404, { message: 'Todo not found' });
    }
    return todo;
  }

  @Delete('/:id')
  delete(id = pathParam('id')) {
    const deleted = this.todoService.delete(Number(id));
    if (!deleted) {
      throw new HTTPException(404, { message: 'Todo not found' });
    }
    return new Response(null, { status: 204 });
  }
}
