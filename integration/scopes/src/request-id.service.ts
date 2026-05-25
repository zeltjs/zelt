import { getContext, Injectable, setContext } from '@zeltjs/core';

// Singleton service that reads/writes request-scoped data through context.
// Demonstrates how a single service can safely serve concurrent requests
// without per-request instances by routing state through the context.
@Injectable()
export class RequestIdService {
  static constructorCalls = 0;

  constructor() {
    RequestIdService.constructorCalls += 1;
  }

  assign(id: string): void {
    setContext('requestId', id);
    setContext('counter', 0);
    setContext('trace', []);
  }

  current(): string {
    const id = getContext('requestId');
    if (id === undefined) {
      throw new Error('requestId is not set in this request context');
    }
    return id;
  }

  tick(label: string): number {
    const next = (getContext('counter') ?? 0) + 1;
    setContext('counter', next);
    const trace = getContext('trace') ?? [];
    setContext('trace', [...trace, label]);
    return next;
  }

  trace(): string[] {
    return getContext('trace') ?? [];
  }
}
