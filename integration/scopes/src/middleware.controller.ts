import type { Next } from '@zeltjs/core';
import { Controller, Get, Middleware, request, resultOf, UseMiddleware } from '@zeltjs/core';

type RequestIdentity = {
  requestId: string;
  chain: string[];
};

// Assigns a per-request id from query (?id=...) and provides an empty chain
// bucket that downstream middlewares append to. Demonstrates providing a
// value to the rest of the chain via `next(value)`.
@Middleware
export class AssignIdMiddleware {
  async use(next: Next<RequestIdentity>, req = request()): Promise<Response | undefined> {
    const id = req.queryParam('id') ?? 'anonymous';
    await next({ requestId: id, chain: [] });
    return undefined;
  }
}

// Class middleware: appends a tag to the chain. Demonstrates that multiple
// middlewares can read the same upstream result (via resultOf) and mutate
// the shared array without leaking across requests, because the store is
// request-scoped (AsyncLocalStorage).
@Middleware
export class AppendStageOneMiddleware {
  async use(next: Next<string>): Promise<Response | undefined> {
    const { chain } = resultOf(AssignIdMiddleware);
    chain.push('stage-one');
    await next('stage-one');
    return undefined;
  }
}

@Middleware
export class AppendStageTwoMiddleware {
  async use(next: Next<string>): Promise<Response | undefined> {
    const { chain } = resultOf(AssignIdMiddleware);
    chain.push('stage-two');
    await next('stage-two');
    return undefined;
  }
}

// Throws when the request asks for it (?fail=1). Used to verify that an error
// in one request does not leak context to a sibling request.
@Middleware
export class ConditionalFailMiddleware {
  async use(next: Next, req = request()): Promise<Response | undefined> {
    if (req.queryParam('fail') === '1') {
      throw new Error('middleware intentionally failed');
    }
    await next();
    return undefined;
  }
}

@Controller('/middleware')
@UseMiddleware(AppendStageTwoMiddleware)
@UseMiddleware(AppendStageOneMiddleware)
export class MiddlewareController {
  @Get('/context')
  read(req = request()) {
    const id = req.queryParam('id');
    const { requestId, chain } = resultOf(AssignIdMiddleware);
    return {
      idFromQuery: id,
      requestId,
      // The last middleware in the chain provides the tag the handler reads.
      middlewareTag: resultOf(AppendStageTwoMiddleware),
      middlewareChain: chain,
    };
  }

  @Get('/fail-safe')
  @UseMiddleware(ConditionalFailMiddleware)
  failSafe() {
    const { requestId, chain } = resultOf(AssignIdMiddleware);
    return {
      requestId,
      middlewareTag: resultOf(AppendStageTwoMiddleware),
      middlewareChain: chain,
    };
  }
}
