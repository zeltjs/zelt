import { Controller, Get, inject, request } from '@zeltjs/core';

import './context-schema';
import { CounterService } from './counter.service';
import { RequestIdService } from './request-id.service';

@Controller('/scopes')
export class ScopesController {
  static constructorCalls = 0;

  constructor(
    private counter = inject(CounterService),
    private requestIds = inject(RequestIdService),
  ) {
    ScopesController.constructorCalls += 1;
  }

  @Get('/singleton')
  singleton() {
    const value = this.counter.increment();
    return {
      value,
      counterConstructorCalls: CounterService.constructorCalls,
      controllerConstructorCalls: ScopesController.constructorCalls,
    };
  }

  @Get('/request')
  request(req = request()) {
    const id = req.header('X-Request-Id');
    this.requestIds.assign(id ?? 'anonymous');
    const first = this.requestIds.tick('begin');
    const second = this.requestIds.tick('end');
    return {
      requestId: this.requestIds.current(),
      tickValues: [first, second],
      trace: this.requestIds.trace(),
      requestIdServiceConstructorCalls: RequestIdService.constructorCalls,
    };
  }

  @Get('/overlap')
  async overlap(req = request()) {
    const id = req.queryParam('id');
    const delay = req.queryParam('delay');
    this.requestIds.assign(id ?? 'missing');
    this.requestIds.tick('start');
    const ms = Number(delay ?? '0');
    if (ms > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }
    this.requestIds.tick('after-delay');
    return {
      requestId: this.requestIds.current(),
      trace: this.requestIds.trace(),
    };
  }
}
