import { Injectable } from '@zeltjs/core';

// Singleton (DEFAULT scope): a single instance is shared across all requests.
@Injectable()
export class CounterService {
  static constructorCalls = 0;
  private invocations = 0;

  constructor() {
    CounterService.constructorCalls += 1;
  }

  increment(): number {
    this.invocations += 1;
    return this.invocations;
  }

  get total(): number {
    return this.invocations;
  }
}
