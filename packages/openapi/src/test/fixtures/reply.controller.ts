import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/reply')
export class ReplyController {
  /** @throws {TypeError} */
  @Get('/:id')
  show(req = request(), res = response()) {
    const id = req.pathParam('id');
    if (id === 'missing') return res.status(404).json({ code: 'NOT_FOUND' });
    if (id === 'failed') return res.status(500).json({ code: 'FAILED' });
    return { id, name: 'User' };
  }

  /** @throws {TypeError} */
  @Get('/empty')
  empty(res = response()) {
    return res.status(204).empty();
  }
}
