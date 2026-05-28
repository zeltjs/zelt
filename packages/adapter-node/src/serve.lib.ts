import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';

export type ServeOptions = {
  port?: number;
  hostname?: string;
};

export type AddressInfo = {
  port: number;
  address: string;
};

type AppLike = {
  fetch: (request: Request) => Promise<Response>;
};

const buildServeOptions = (
  optionsOrCallback: ServeOptions | ((info: AddressInfo) => void) | undefined,
): ServeOptions => (typeof optionsOrCallback === 'function' ? {} : (optionsOrCallback ?? {}));

const extractCallback = (
  optionsOrCallback: ServeOptions | ((info: AddressInfo) => void) | undefined,
  maybeCallback: ((info: AddressInfo) => void) | undefined,
): ((info: AddressInfo) => void) | undefined =>
  typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;

export const serveApp = (
  app: AppLike,
  optionsOrCallback?: ServeOptions | ((info: AddressInfo) => void),
  maybeCallback?: (info: AddressInfo) => void,
): ServerType => {
  const options = buildServeOptions(optionsOrCallback);
  const callback = extractCallback(optionsOrCallback, maybeCallback);

  return serve(
    {
      fetch: app.fetch,
      port: options.port ?? 3000,
      hostname: options.hostname ?? '0.0.0.0',
    },
    callback,
  );
};
