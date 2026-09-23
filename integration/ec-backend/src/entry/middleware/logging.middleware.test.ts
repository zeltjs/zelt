import type { LogEntry, TransportBinding } from '@zeltjs/core';
import { Config, Controller, createApp, Get, http, LoggerConfig, Post } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LoggingMiddleware } from './logging.middleware';

@Config
class RecordingLoggerConfig extends LoggerConfig {
  readonly entries: LogEntry[] = [];

  override get transports(): readonly TransportBinding[] {
    return [
      {
        transport: { write: () => {} },
        formatter: {
          format: (entry) => {
            this.entries.push(entry);
            return '';
          },
        },
      },
    ];
  }
}

@Controller('/probe')
class ProbeController {
  @Get('/ok')
  ok() {
    return { ok: true };
  }

  @Post('/echo')
  echo() {
    return { echoed: true };
  }

  @Get('/missing')
  missing() {
    throw new HTTPException(404, { message: 'Not here' });
  }

  @Get('/broken')
  broken() {
    throw new Error('boom');
  }
}

const startProbeApp = () =>
  onTest(createApp([http({ controllers: [ProbeController], middlewares: [LoggingMiddleware] })]), {
    configs: [RecordingLoggerConfig],
  });

// requestContext() は HTTP パイプラインの中でしか得られないため、実アプリ経由で use を通す
describe('LoggingMiddleware (real LoggerService, LoggerConfig swapped for a recorder)', () => {
  let app: Awaited<ReturnType<typeof startProbeApp>>;
  let entries: LogEntry[];

  beforeEach(async () => {
    app = await startProbeApp();
    const loggerConfig = await app.get(LoggerConfig);
    if (!(loggerConfig instanceof RecordingLoggerConfig)) {
      throw new Error('RecordingLoggerConfig was not applied');
    }
    entries = loggerConfig.entries;
  });

  afterEach(async () => {
    await shutdownAll();
  });

  const requestLogs = () => entries.filter((entry) => entry.message === 'request');

  it('logs method, path and status of a successful request', async () => {
    await app.http.request('/probe/ok');

    expect(requestLogs()).toEqual([
      expect.objectContaining({
        level: 'info',
        message: 'request',
        context: expect.objectContaining({ method: 'GET', path: '/probe/ok', status: 200 }),
      }),
    ]);
  });

  it('logs the HTTP method of non-GET requests', async () => {
    await app.http.request('/probe/echo', { method: 'POST' });

    expect(requestLogs()[0]?.context).toMatchObject({ method: 'POST', path: '/probe/echo' });
  });

  it('logs the path without the query string', async () => {
    await app.http.request('/probe/ok?page=2');

    expect(requestLogs()[0]?.context).toMatchObject({ path: '/probe/ok' });
  });

  it('logs the status of an HTTPException response', async () => {
    const res = await app.http.request('/probe/missing');

    expect(res.status).toBe(404);
    expect(requestLogs()[0]?.context).toMatchObject({ path: '/probe/missing', status: 404 });
  });

  it('logs the status of an unexpected error response', async () => {
    const res = await app.http.request('/probe/broken');

    expect(res.status).toBe(500);
    expect(requestLogs()[0]?.context).toMatchObject({ path: '/probe/broken', status: 500 });
  });

  it('logs the duration as a non-negative whole number of milliseconds', async () => {
    await app.http.request('/probe/ok');

    const duration = requestLogs()[0]?.context['duration'];
    expect(Number.isInteger(duration)).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('writes one entry per request', async () => {
    await app.http.request('/probe/ok');
    await app.http.request('/probe/ok');

    expect(requestLogs()).toHaveLength(2);
  });

  it('passes the handler response through unchanged', async () => {
    const res = await app.http.request('/probe/ok');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
