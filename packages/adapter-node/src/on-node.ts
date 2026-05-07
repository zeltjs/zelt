import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { EnvConfig, ProcessEnvConfig, type HttpApp } from '@zeltjs/core';

type ListenOptions = {
  readonly port?: number;
  readonly hostname?: string;
};

export type ServerHandle = {
  readonly address: { port: number; address: string };
  readonly shutdown: () => Promise<void>;
};

type OnNodeHandle = {
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
};

export const onNode = (app: HttpApp): OnNodeHandle => {
  const listen = async (portOrOptions?: number | ListenOptions): Promise<ServerHandle> => {
    const options: ListenOptions =
      typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions ?? {});

    // Attempt to auto-inject ProcessEnvConfig. If EnvConfig is not registered in configs, the
    // call throws and we ignore it — the app simply doesn't need env config.
    try {
      app.replaceConfig(EnvConfig, ProcessEnvConfig);
    } catch {
      // Token not in configs or already ready — ignore
    }

    await app.ready();

    const port = options.port ?? 3000;
    const hostname = options.hostname ?? '0.0.0.0';

    let server: ServerType;
    const serverReady = new Promise<{ port: number; address: string }>((resolve) => {
      server = serve(
        { fetch: app.fetch, port, hostname },
        (info) => resolve({ port: info.port, address: info.address }),
      );
    });

    const address = await serverReady;

    const shutdown = async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await app.shutdown();
    };

    return { address, shutdown };
  };

  return { listen };
};
