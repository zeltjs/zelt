import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { EnvConfig, type HttpApp, type ReadyOptions } from '@zeltjs/core';

import { ProcessEnvConfig } from './process-env.config';

type ListenOptions = {
  readonly port?: number;
  readonly hostname?: string;
};

export type ServerHandle = {
  readonly address: { port: number; address: string };
  readonly shutdown: () => Promise<void>;
};

export type NodeAppOptions = {
  readonly warmup?: boolean;
};

export type NodeApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => T;
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
  readonly shutdown: () => Promise<void>;
};

export const onNode = async (app: HttpApp, options: NodeAppOptions = {}): Promise<NodeApp> => {
  if (app.hasConfig(EnvConfig)) {
    app.replaceConfig(EnvConfig, ProcessEnvConfig);
  }

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? true };
  const { get } = await app.ready(readyOptions);

  const listen = async (portOrOptions?: number | ListenOptions): Promise<ServerHandle> => {
    const listenOptions: ListenOptions =
      typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions ?? {});

    const port = listenOptions.port ?? 3000;
    const hostname = listenOptions.hostname ?? '0.0.0.0';

    let server!: ServerType;
    const serverReady = new Promise<{ port: number; address: string }>((resolve) => {
      server = serve({ fetch: app.fetch, port, hostname }, (info) =>
        resolve({ port: info.port, address: info.address }),
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

  return { get, listen, shutdown: app.shutdown };
};
