import { Controller, Get, inject, Post, request, response } from '@zeltjs/core';
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
  greet(): GreetResponse {
    return { message: this.helloService.greet(request().pathParam('name')) };
  }

  @Post('/')
  async greetPost(req = request(GreetBody), res = response()) {
    const body = await req.body();
    const message =
      body.excited === true
        ? `${this.helloService.greet(body.name)}!!!`
        : this.helloService.greet(body.name);
    const payload: GreetResponse = { message };
    return res.json(payload, 201);
  }
}
