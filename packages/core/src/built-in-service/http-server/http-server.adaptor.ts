import { ZeltNotImplementedError } from '../../kernel';
import { Config } from '../config';

export type HttpListenOptions = { readonly port?: number; readonly hostname?: string };
export type HttpServerHandle = {
  readonly address: { readonly port: number; readonly address: string };
  readonly closed: Promise<void>;
  readonly shutdown: () => Promise<void>;
};
export type HttpServerShutdownRegistration = (callback: () => Promise<void>) => () => Promise<void>;

/** Platform implementations provide socket ownership without importing a server into core. */
@Config
export class HttpServerAdaptor {
  /** @throws {ZeltNotImplementedError} */
  async listen(
    _fetch: (request: Request) => Promise<Response>,
    _options: HttpListenOptions,
    _registerShutdown: HttpServerShutdownRegistration,
  ): Promise<HttpServerHandle> {
    throw new ZeltNotImplementedError({ className: 'HttpServerAdaptor', methodName: 'listen' });
  }
}
