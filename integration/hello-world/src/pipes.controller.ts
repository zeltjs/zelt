import { Controller, Get, HTTPException, inject, pathParam } from '@zeltjs/core';

import { HelloService } from './hello.service';

const parseIntParam = (value: string): number => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new HTTPException(400, { message: `Invalid integer: ${value}` });
  }
  return parsed;
};

@Controller('/pipes')
export class PipesController {
  constructor(private helloService = inject(HelloService)) {}

  @Get('/user/:id')
  getUserById(id = pathParam('id')) {
    const numericId = parseIntParam(id);
    return { id: numericId, greeting: this.helloService.greeting() };
  }

  @Get('/transform/:value')
  transformValue(value = pathParam('value')) {
    return { original: value, upper: value.toUpperCase(), lower: value.toLowerCase() };
  }
}
