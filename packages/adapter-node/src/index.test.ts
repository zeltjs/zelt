import { afterEach, describe, expect, it } from 'vitest';
import type { ServerType } from '@hono/node-server';

import { serve, type AddressInfo } from './index';

const createMockApp = () => ({
  fetch: async (req: Request) => new Response(`Hello from ${req.url}`),
  request: async () => new Response(''),
});

const waitForListening = (server: ServerType): Promise<void> =>
  new Promise((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', () => resolve());
    }
  });

describe('serve', () => {
  let server: ServerType | undefined;

  afterEach(() => {
    server?.close();
  });

  it('returns http.Server and starts listening', async () => {
    const app = createMockApp();
    const s = serve(app, { port: 13000 });
    server = s;

    await waitForListening(s);

    expect(s).toBeDefined();
    expect(s.listening).toBe(true);

    const address = s.address();
    expect(address).not.toBeNull();
    expect(typeof address === 'object' && address?.port).toBe(13000);
  });

  it('listens on specified port', async () => {
    const app = createMockApp();
    const s = serve(app, { port: 4567 });
    server = s;

    await waitForListening(s);

    expect(s.listening).toBe(true);

    const address = s.address();
    expect(typeof address === 'object' && address?.port).toBe(4567);
  });

  it('invokes callback with AddressInfo when options provided', async () => {
    const app = createMockApp();
    let receivedInfo: AddressInfo | undefined;

    const s = serve(app, { port: 5678 }, (info: AddressInfo) => {
      receivedInfo = info;
    });
    server = s;

    await waitForListening(s);

    expect(receivedInfo).toBeDefined();
    expect(receivedInfo?.port).toBe(5678);
    expect(typeof receivedInfo?.address).toBe('string');
  });

  it('invokes callback with options and callback', async () => {
    const app = createMockApp();
    let receivedInfo: AddressInfo | undefined;

    const s = serve(app, { port: 13001 }, (info: AddressInfo) => {
      receivedInfo = info;
    });
    server = s;

    await waitForListening(s);

    expect(receivedInfo).toBeDefined();
    expect(receivedInfo?.port).toBe(13001);
  });

  it('responds to HTTP requests', async () => {
    const app = createMockApp();
    const s = serve(app, { port: 6789 });
    server = s;

    await waitForListening(s);

    const response = await fetch('http://localhost:6789/hello');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe('Hello from http://localhost:6789/hello');
  });
});

describe('createAdaptorServer', () => {
  it('is exported from the module', async () => {
    const { createAdaptorServer } = await import('./index');
    expect(createAdaptorServer).toBeDefined();
    expect(typeof createAdaptorServer).toBe('function');
  });
});
