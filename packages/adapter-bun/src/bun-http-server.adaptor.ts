import type {
  HttpListenOptions,
  HttpServerHandle,
  HttpServerShutdownRegistration,
} from '@zeltjs/core';
import { Config, HttpServerAdaptor } from '@zeltjs/core';

@Config
export class BunHttpServerAdaptor extends HttpServerAdaptor {
  /** @throws {Error} */
  override async listen(
    fetch: (request: Request) => Promise<Response>,
    options: HttpListenOptions,
    registerShutdown: HttpServerShutdownRegistration,
  ): Promise<HttpServerHandle> {
    let close!: () => void;
    const closed = new Promise<void>((resolve) => {
      close = resolve;
    });
    let server: ReturnType<typeof Bun.serve> | undefined;
    const shutdown = registerShutdown(async () => {
      if (server !== undefined) await server.stop();
      close();
    });
    try {
      server = Bun.serve({
        fetch,
        port: options.port ?? 3000,
        hostname: options.hostname ?? '0.0.0.0',
      });
    } catch (error) {
      await shutdown();
      throw error;
    }
    const port = server.port;
    const address = server.hostname;
    if (port === undefined || address === undefined) {
      await shutdown();
      throw new Error('Bun did not return a TCP listening address');
    }
    return {
      address: { port, address },
      closed,
      shutdown,
    };
  }
}
