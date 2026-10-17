import type {
  HttpListenOptions,
  HttpServerHandle,
  HttpServerShutdownRegistration,
} from '@zeltjs/core';
import { Config, HttpServerAdaptor } from '@zeltjs/core';

@Config
export class TxikiHttpServerAdaptor extends HttpServerAdaptor {
  override async listen(
    fetch: (request: Request) => Promise<Response>,
    options: HttpListenOptions,
    registerShutdown: HttpServerShutdownRegistration,
  ): Promise<HttpServerHandle> {
    let server: ReturnType<typeof tjs.serve> | undefined;
    let close!: () => void;
    const closed = new Promise<void>((resolve) => {
      close = resolve;
    });
    const shutdown = registerShutdown(async () => {
      if (server !== undefined) await server.close();
      close();
    });
    try {
      server = tjs.serve({
        fetch,
        port: options.port ?? 3000,
        listenIp: options.hostname ?? '127.0.0.1',
      });
    } catch (error) {
      await shutdown();
      throw error;
    }
    return {
      address: { port: server.port, address: options.hostname ?? '127.0.0.1' },
      closed,
      shutdown,
    };
  }
}
