import type { FunctionMiddleware, Next, RequestContext } from '@zeltjs/core';
import {
  Controller,
  Get,
  getContext,
  Middleware,
  queryParam,
  setContext,
  UseMiddleware,
} from '@zeltjs/core';

import './context-schema';

// Function middleware: assigns a per-request id from query (?id=...) and
// initializes context buckets used by subsequent middlewares and the handler.
export const assignIdMiddleware: FunctionMiddleware = async (c, next) => {
  const id = c.req.query('id') ?? 'anonymous';
  setContext('requestId', id);
  setContext('middlewareChain', []);
  await next();
};

// Class middleware: appends a tag to the chain. Demonstrates that multiple
// middlewares can read+write the same context bucket without leaking across
// requests because storage is request-scoped (AsyncLocalStorage).
@Middleware
export class AppendStageOneMiddleware {
  async use(_c: RequestContext, next: Next): Promise<Response | undefined> {
    const chain = getContext('middlewareChain') ?? [];
    setContext('middlewareChain', [...chain, 'stage-one']);
    setContext('middlewareTag', 'stage-one');
    await next();
    return undefined;
  }
}

@Middleware
export class AppendStageTwoMiddleware {
  async use(_c: RequestContext, next: Next): Promise<Response | undefined> {
    const chain = getContext('middlewareChain') ?? [];
    setContext('middlewareChain', [...chain, 'stage-two']);
    // Overwrite the tag to verify the latest middleware's value wins.
    setContext('middlewareTag', 'stage-two');
    await next();
    return undefined;
  }
}

// Throws when the request asks for it (?fail=1). Used to verify that an error
// in one request does not leak context to a sibling request.
@Middleware
export class ConditionalFailMiddleware {
  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    if (c.req.query('fail') === '1') {
      throw new Error('middleware intentionally failed');
    }
    await next();
    return undefined;
  }
}

@Controller('/middleware')
@UseMiddleware(AppendStageOneMiddleware, AppendStageTwoMiddleware)
export class MiddlewareController {
  @Get('/context')
  read(id = queryParam('id')) {
    // Reading via getContext proves that values written by middleware are
    // visible to the controller within the same request.
    return {
      idFromQuery: id,
      requestId: getContext('requestId'),
      middlewareTag: getContext('middlewareTag'),
      middlewareChain: getContext('middlewareChain'),
    };
  }

  @Get('/fail-safe')
  @UseMiddleware(ConditionalFailMiddleware)
  failSafe() {
    return {
      requestId: getContext('requestId'),
      middlewareTag: getContext('middlewareTag'),
      middlewareChain: getContext('middlewareChain'),
    };
  }
}
