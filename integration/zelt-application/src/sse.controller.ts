import { Controller, Get, queryParam, response } from '@zeltjs/core';

@Controller('/sse')
export class SseController {
  @Get('/messages')
  messages(res = response()) {
    return res.sse(async (stream) => {
      await stream.writeSSE({
        data: JSON.stringify({ hello: 'world' }),
        event: 'message',
        id: '1',
      });
      await stream.writeSSE({ data: JSON.stringify({ hello: 'zelt' }), event: 'message', id: '2' });
    });
  }

  @Get('/burst')
  burst(res = response(), n = queryParam('n') ?? '20', size = queryParam('size') ?? '256') {
    const count = Number.parseInt(n, 10);
    const payload = 'X'.repeat(Number.parseInt(size, 10));
    return res.sse(async (stream) => {
      for (let i = 0; i < count; i++) {
        await stream.writeSSE({ data: payload });
      }
    });
  }
}
