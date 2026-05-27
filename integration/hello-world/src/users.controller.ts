import { Controller, Post } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  name: v.string(),
  email: v.string(),
  age: v.optional(v.number()),
});

@Controller('/users')
export class UsersController {
  @Post('/')
  create(data = validated(CreateUserSchema)) {
    return { id: '1', ...data };
  }
}
