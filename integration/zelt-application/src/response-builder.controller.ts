import { Controller, Get, response } from '@zeltjs/core';

@Controller('/response')
export class ResponseBuilderController {
  @Get('/json')
  json(res = response()) {
    return res.json({ ok: true });
  }

  @Get('/json-status')
  jsonStatus(res = response()) {
    return res.json({ created: true }, 201);
  }

  @Get('/bad-request')
  badRequest(res = response()) {
    return res.status(400).header('X-Reason', 'invalid').json({ code: 'INVALID' });
  }

  @Get('/unavailable')
  unavailable(res = response()) {
    return res.status(503).json({ code: 'UNAVAILABLE' });
  }

  @Get('/no-content')
  noContent(res = response()) {
    return res.status(204).empty();
  }

  @Get('/not-modified')
  notModified(res = response()) {
    return res.status(304).header('ETag', 'cached').empty();
  }

  @Get('/text')
  text(res = response()) {
    return res.text('plain text', 200);
  }

  @Get('/headers')
  headers(res = response()) {
    return res
      .header('X-Custom', 'custom-value')
      .header('X-Another', 'another-value')
      .json({ ok: true });
  }

  @Get('/redirect')
  redirect(res = response()) {
    return res.redirect('/response/json', 302);
  }

  @Get('/cookie')
  cookie(res = response()) {
    return res.setCookie('session', 'abc123', { httpOnly: true }).json({ ok: true });
  }
}
