import { Controller, Get, Post, inject, pathParam, response, validated } from '@koya/core';
import * as v from 'valibot';

import { HelloService } from './hello.service';

export const GreetBody = v.object({
  name: v.string(),
  excited: v.optional(v.boolean()),
});
export type GreetBody = v.InferOutput<typeof GreetBody>;

export type GreetResponse = {
  message: string;
};

@Controller('/hello')
export class HelloController {
  constructor(private helloService = inject(HelloService)) {}

  @Get('/:name')
  greet(name = pathParam('name')): GreetResponse {
    return { message: this.helloService.greet(name) };
  }

  @Post('/')
  greetPost(body = validated(GreetBody), res = response()) {
    const message =
      body.excited === true
        ? `${this.helloService.greet(body.name)}!!!`
        : this.helloService.greet(body.name);
    const payload: GreetResponse = { message };
    return res.json(payload, 201);
  }
}
