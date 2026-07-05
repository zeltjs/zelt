import { Controller, Get, HTTPException, inject, request } from '@zeltjs/core';

import { HelloService } from './hello.service';

const parseIntParam = (value: string): number => {
  if (!/^-?\d+$/.test(value)) {
    throw new HTTPException(400, { message: `Invalid integer: ${value}` });
  }
  return Number(value);
};

@Controller('/pipes')
export class PipesController {
  constructor(private helloService = inject(HelloService)) {}

  @Get('/user/:id')
  getUserById(req = request()) {
    const numericId = parseIntParam(req.pathParam('id'));
    return { id: numericId, greeting: this.helloService.greeting() };
  }

  @Get('/transform/:value')
  transformValue(req = request()) {
    const value = req.pathParam('value');
    return { original: value, upper: value.toUpperCase(), lower: value.toLowerCase() };
  }
}
