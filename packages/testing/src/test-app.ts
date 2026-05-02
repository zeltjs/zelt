import type { Application, HttpRuntimeOptions } from '@koya/core';

export type TestApp = {
  readonly request: (method: string, path: string, body?: unknown) => Promise<Response>;
};

export const createTestApp = (app: Application, options: HttpRuntimeOptions): TestApp => {
  const worker = app.http(options).toWorker();
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
