import { Injectable } from '@zeltjs/core';

// Singleton state holder to verify both controllers share the same instance.
@Injectable()
export class CounterService {
  private count = 0;

  increment(): number {
    this.count += 1;
    return this.count;
  }

  value(): number {
    return this.count;
  }
}
