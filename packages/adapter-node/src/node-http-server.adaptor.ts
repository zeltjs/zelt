import type {
  HttpListenOptions,
  HttpServerHandle,
  HttpServerShutdownRegistration,
} from '@zeltjs/core';
import { Config, HttpServerAdaptor } from '@zeltjs/core';
import { createListenForHttp } from './listen.lib';

@Config
export class NodeHttpServerAdaptor extends HttpServerAdaptor {
  override listen(
    fetch: (request: Request) => Promise<Response>,
    options: HttpListenOptions,
    registerShutdown: HttpServerShutdownRegistration,
  ): Promise<HttpServerHandle> {
    return createListenForHttp(fetch, registerShutdown)(options);
  }
}
