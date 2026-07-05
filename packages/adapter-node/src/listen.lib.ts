import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';

export type ListenOptions = {
  readonly port?: number;
  readonly hostname?: string;
};

export type ServerHandle = {
  readonly address: { port: number; address: string };
  readonly shutdown: () => Promise<void>;
};

const closeServer = (server: ServerType): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

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
    const serverReady = new Promise<{ port: number; address: string }>((resolve) => {
      server = serve({ fetch: appFetch, port, hostname }, (info) =>
        resolve({ port: info.port, address: info.address }),
      );
    });
    const shutdown = registerShutdown(() => closeServer(server));

    const address = await serverReady;

    return { address, shutdown };
  };
};
