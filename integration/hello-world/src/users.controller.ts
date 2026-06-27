import { Controller, Post } from '@zeltjs/core';
import { request } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

export const CreateUserSchema = v.object({
  name: v.string(),
  email: v.string(),
  age: v.optional(v.number()),
});

@Controller('/users')
export class UsersController {
  @Post('/')
  async create(req = request(CreateUserSchema)) {
    const data = await req.body();
    return { id: '1', ...data };
  }
}
