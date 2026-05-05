import { Controller, Get, Post, validated, pathParam, response } from '@zeltjs/core';
import * as v from 'valibot';

export const CreateUserBody = v.object({
  name: v.string(),
  email: v.string(),
});
export type CreateUserBody = v.InferOutput<typeof CreateUserBody>;

export type User = {
  id: string;
  name: string;
  email: string;
};

@Controller('/users')
export class UserController {
  @Get('/:id')
  async show(id = pathParam('id')): Promise<User> {
    return { id, name: 'a', email: 'a@a' };
  }

  @Post('/')
  async create(body = validated(CreateUserBody), res = response()) {
    return res.json({ id: '1', name: body.name, email: body.email }, 201);
  }
}
