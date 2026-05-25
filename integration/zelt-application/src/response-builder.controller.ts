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
