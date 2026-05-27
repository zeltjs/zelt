import type { Next } from '@zeltjs/core';
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

@Middleware
export class AssignIdMiddleware {
  async use(next: Next): Promise<Response | undefined> {
    const id = queryParam('id') ?? 'anonymous';
    setContext('requestId', id);
    setContext('middlewareChain', []);
    await next();
    return undefined;
  }
}

@Middleware
export class AppendStageOneMiddleware {
  async use(next: Next): Promise<Response | undefined> {
    const chain = getContext('middlewareChain') ?? [];
    setContext('middlewareChain', [...chain, 'stage-one']);
    setContext('middlewareTag', 'stage-one');
    await next();
    return undefined;
  }
}

@Middleware
export class AppendStageTwoMiddleware {
  async use(next: Next): Promise<Response | undefined> {
    const chain = getContext('middlewareChain') ?? [];
    setContext('middlewareChain', [...chain, 'stage-two']);
    setContext('middlewareTag', 'stage-two');
    await next();
    return undefined;
  }
}

@Middleware
export class ConditionalFailMiddleware {
  async use(next: Next): Promise<Response | undefined> {
    if (queryParam('fail') === '1') {
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
