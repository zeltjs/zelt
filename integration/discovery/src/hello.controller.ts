import { Controller, Get } from '@zeltjs/core';

// Minimal controller so createApp({ http }) has something to register.
// Discovery tests operate on metadata, not HTTP requests.
@Controller('/hello')
export class HelloController {
  @Get('/')
  index() {
    return { ok: true };
  }
}
