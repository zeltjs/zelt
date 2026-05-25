// Augment the per-request context schema so getContext/setContext
// can store request-scoped values with type safety (no globals required).
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    requestId: string;
    counter: number;
    trace: string[];
    middlewareTag: string;
    middlewareChain: string[];
  }
}

export {};
