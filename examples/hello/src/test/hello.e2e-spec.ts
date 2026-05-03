import { describe, it, expect } from 'vitest';

import { app } from '../app';

describe('/hello', () => {
  it('module loads', async () => {
    const worker = app.toWorker();

    const res = await worker.fetch(new Request('https://example.local/hello/koya'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ message: 'hello, koya' });
  });
});
