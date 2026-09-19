import type { Next } from '@zeltjs/core';
import {
  Controller,
  Get,
  inject,
  Middleware,
  middlewareValue,
  request,
  UseMiddleware,
} from '@zeltjs/core';

import { CounterService } from './counter.service';
import type { RequestState } from './request-id.service';
import { RequestIdService } from './request-id.service';

// Provides a fresh, mutable per-request state bucket. Demonstrates the
// "counter/trace" shape: a middleware allocates a mutable object and hands
// it downstream via `next(value)`; the handler reads it via middlewareValue() and
// passes it explicitly to the singleton service instead of the service
// reaching into request-scoped storage itself.
@Middleware
export class RequestStateMiddleware {
  async use(next: Next<RequestState>): Promise<Response | undefined> {
    await next({ counter: 0, trace: [] });
    return undefined;
  }
}

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
  @UseMiddleware(RequestStateMiddleware)
  request(req = request()) {
    const id = req.header('X-Request-Id') ?? 'anonymous';
    const state = middlewareValue(RequestStateMiddleware);
    const first = this.requestIds.tick(state, 'begin');
    const second = this.requestIds.tick(state, 'end');
    return {
      requestId: id,
      tickValues: [first, second],
      trace: state.trace,
      requestIdServiceConstructorCalls: RequestIdService.constructorCalls,
    };
  }

  @Get('/overlap')
  @UseMiddleware(RequestStateMiddleware)
  async overlap(req = request()) {
    const id = req.queryParam('id') ?? 'missing';
    const delay = req.queryParam('delay');
    const state = middlewareValue(RequestStateMiddleware);
    this.requestIds.tick(state, 'start');
    const ms = Number(delay ?? '0');
    if (ms > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }
    this.requestIds.tick(state, 'after-delay');
    return {
      requestId: id,
      trace: state.trace,
    };
  }
}
