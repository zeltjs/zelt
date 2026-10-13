import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/portable-reply')
export class PortableReplyController {
  /** @throws {TypeError} */
  @Get('/:id')
  show(req = request(), res = response()) {
    const id = req.pathParam('id');
    if (id === 'missing') return res.status(404).json({ code: 'NOT_FOUND' });
    if (id === 'failed') return res.status(500).json({ code: 'LOOKUP_FAILED' });
    return { id, name: 'User' };
  }
}
