import { Controller, Delete, Get, Patch, Post, Put, pathParam, response } from '@zeltjs/core';

@Controller('/routing')
export class RoutingController {
  @Get('/case')
  caseSensitive() {
    return { matched: 'lowercase' };
  }

  @Get('/params/:id')
  params(id = pathParam('id')) {
    return { id };
  }

  @Get('/multi/:a/:b')
  multi(a = pathParam('a'), b = pathParam('b')) {
    return { a, b };
  }

  @Post('/methods')
  postMethod() {
    return { method: 'POST' };
  }

  @Put('/methods')
  putMethod() {
    return { method: 'PUT' };
  }

  @Patch('/methods')
  patchMethod() {
    return { method: 'PATCH' };
  }

  @Delete('/methods')
  deleteMethod() {
    return { method: 'DELETE' };
  }

  @Get('/custom-status')
  customStatus(res = response()) {
    return res.json({ created: true }, 201);
  }
}
