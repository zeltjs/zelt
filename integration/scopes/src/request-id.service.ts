import { Injectable } from '@zeltjs/core';

export type RequestState = {
  counter: number;
  trace: string[];
};

// Singleton service operating on request-scoped state passed in by the
// caller. Demonstrates how a single service instance can safely serve
// concurrent requests without per-request instances: the mutable state
// lives outside the service (owned by the caller's middleware-provided
// value), not on `this`.
@Injectable()
export class RequestIdService {
  static constructorCalls = 0;

  constructor() {
    RequestIdService.constructorCalls += 1;
  }

  tick(state: RequestState, label: string): number {
    state.counter += 1;
    state.trace.push(label);
    return state.counter;
  }
}
