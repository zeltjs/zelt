import { createHttpApp, type CreateHttpAppOptions } from '@koya/core';

export type TestApp = {
  readonly request: (method: string, path: string, body?: unknown) => Promise<Response>;
};

export const createTestApp = (options: CreateHttpAppOptions): TestApp => {
  const worker = createHttpApp(options).toWorker();
  return {
    request: async (method, path, body) => {
      const init: RequestInit = body
        ? {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : { method };
      return worker.fetch(new Request(`https://test.local${path}`, init));
    },
  };
};
