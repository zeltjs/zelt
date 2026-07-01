import { Controller, Get, SkipMiddleware, UseMiddleware } from '@zeltjs/core';
import { LoggingMiddleware } from './logging.middleware';
import { HeaderMiddleware } from './transform.middleware';

@UseMiddleware(LoggingMiddleware)
@Controller('/middleware')
export class MiddlewareController {
  @Get('/with-logging')
  withLogging() {
    return { ok: true };
  }

  @SkipMiddleware(LoggingMiddleware)
  @Get('/skip-logging')
  skipLogging() {
    return { ok: true };
  }

  @UseMiddleware(HeaderMiddleware, { headerName: 'X-Custom', headerValue: 'test-value' })
  @Get('/with-header')
  withHeader() {
    return { ok: true };
  }
}
