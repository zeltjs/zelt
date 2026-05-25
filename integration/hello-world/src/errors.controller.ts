import { Controller, Get, HTTPException } from '@zeltjs/core';

@Controller('/errors')
export class ErrorsController {
  @Get('/sync')
  synchronous() {
    throw new HTTPException(400, { message: 'Integration test' });
  }

  @Get('/async')
  async asynchronous() {
    throw new HTTPException(400, { message: 'Integration test' });
  }

  @Get('/unexpected')
  unexpected() {
    throw new Error('Unexpected error');
  }
}
