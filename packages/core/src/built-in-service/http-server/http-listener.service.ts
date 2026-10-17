import { Injectable, inject } from '../../kernel';
import type {
  HttpListenOptions,
  HttpServerHandle,
  HttpServerShutdownRegistration,
} from './http-server.adaptor';
import { HttpServerAdaptor } from './http-server.adaptor';

export type HttpFetchTarget = {
  readonly fetch: (request: Request) => Promise<Response>;
};

@Injectable()
export class HttpListenerService {
  constructor(private readonly platform = inject(HttpServerAdaptor)) {}

  /** @throws {ZeltNotImplementedError} */
  listen(
    http: HttpFetchTarget,
    options: HttpListenOptions,
    registerShutdown: HttpServerShutdownRegistration,
  ): Promise<HttpServerHandle> {
    return this.platform.listen((request) => http.fetch(request), options, registerShutdown);
  }
}
