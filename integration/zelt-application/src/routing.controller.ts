import { Controller, Delete, Get, Patch, Post, Put, request, response } from '@zeltjs/core';

@Controller('/routing')
export class RoutingController {
  @Get('/case')
  caseSensitive() {
    return { matched: 'lowercase' };
  }

  @Get('/params/:id')
  params(req = request()) {
    const id = req.pathParam('id');
    return { id };
  }

  @Get('/multi/:a/:b')
  multi(req = request()) {
    const a = req.pathParam('a');
    const b = req.pathParam('b');
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
