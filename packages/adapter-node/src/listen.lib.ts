import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';

export type ListenOptions = {
  readonly port?: number;
  readonly hostname?: string;
};

export type ServerHandle = {
  readonly address: { port: number; address: string };
  readonly closed: Promise<void>;
  readonly shutdown: () => Promise<void>;
};

const closeServer = (server: ServerType): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

/** @throws {Error} propagates the server's bind error (e.g. EADDRINUSE) instead of hanging */
export const createListenForHttp = (
  appFetch: (request: Request) => Promise<Response>,
  registerShutdown: (callback: () => Promise<void>) => () => Promise<void>,
): ((portOrOptions?: number | ListenOptions) => Promise<ServerHandle>) => {
  return async (portOrOptions?: number | ListenOptions): Promise<ServerHandle> => {
    const listenOptions: ListenOptions =
      typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions ?? {});

    const port = listenOptions.port ?? 3000;
    const hostname = listenOptions.hostname ?? '0.0.0.0';

    let server!: ServerType;
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    // Register before opening the socket so disposed runtimes cannot leak a listener.
    let ready: Promise<'listening' | 'failed'>;
    const shutdown = registerShutdown(async () => {
      if ((await ready) === 'failed') return;
      if (!server.listening) return;
      await closeServer(server);
    });
    const serverReady = new Promise<{ port: number; address: string }>((resolve, reject) => {
      const onError = (err: Error): void => reject(err);
      server = serve({ fetch: appFetch, port, hostname }, (info) => {
        server.off('error', onError);
        resolve({ port: info.port, address: info.address });
      });
      server.once('error', onError);
      server.once('close', resolveClosed);
    });
    // This outcome coordinates cleanup only; callers still await serverReady's rejection.
    ready = serverReady.then(
      () => 'listening',
      () => 'failed',
    );
    let address: { port: number; address: string };
    try {
      address = await serverReady;
    } catch (error) {
      // Remove the registered callback while preserving the original bind failure.
      await shutdown();
      resolveClosed();
      throw error;
    }
    return { address, shutdown, closed };
  };
};
