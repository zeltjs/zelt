import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Server-Sent Events', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('streams events with text/event-stream content type', async () => {
    const res = await testApp.request('/sse/messages');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('event: message');
    expect(text).toContain('id: 1');
    expect(text).toContain('id: 2');
    expect(text).toContain('"hello":"world"');
    expect(text).toContain('"hello":"zelt"');
  });

  it('delivers every event when bursting payloads', async () => {
    const n = 30;
    const size = 1024;
    const res = await testApp.request(`/sse/burst?n=${n}&size=${size}`);
    expect(res.status).toBe(200);

    const text = await res.text();
    const dataLines = text.split('\n').filter((line) => line.startsWith('data: '));
    expect(dataLines).toHaveLength(n);
    for (const line of dataLines) {
      expect(line.length - 'data: '.length).toBe(size);
    }
  });
});
