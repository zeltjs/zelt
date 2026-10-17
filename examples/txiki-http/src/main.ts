import { onTxiki } from '@zeltjs/adapter-txiki';
import type { Next } from '@zeltjs/core';
import {
  Controller,
  createApp,
  Get,
  http,
  httpServer,
  Injectable,
  inject,
  Middleware,
  middlewareValue,
  Post,
  request,
  UseMiddleware,
} from '@zeltjs/core';

@Injectable()
class CounterService {
  private count = 0;
  increment(): number {
    return ++this.count;
  }
}

@Middleware
class TraceMiddleware {
  async use(next: Next<string>, req = request()): Promise<Response | undefined> {
    await Promise.resolve();
    await next(req.header('X-Request-Id') ?? 'anonymous');
    return undefined;
  }
}

@Controller('/api')
class ApiController {
  constructor(private counter = inject(CounterService)) {}

  @Get('/status')
  status() {
    return { runtime: 'txiki.js', count: this.counter.increment() };
  }

  @Post('/echo')
  @UseMiddleware(TraceMiddleware)
  async echo(req = request(), trace = middlewareValue(TraceMiddleware)) {
    await Promise.resolve();
    return {
      id: req.queryParam('id'),
      trace,
      body: await req.body(),
      count: this.counter.increment(),
    };
  }
}

const app = await onTxiki(createApp([http({ controllers: [ApiController] }), httpServer()]));
const port = Number(tjs.env['PORT'] || '3000');
const server = await app.server.listen(app.http, { port });
console.log(JSON.stringify({ event: 'listening', ...server.address }));
