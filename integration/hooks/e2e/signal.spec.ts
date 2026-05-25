import { CliConfig } from '@zeltjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSignalApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, FirstSpy } from '../src/lifecycle-spy';
import type { TestCliConfig } from '../src/test-cli.config';

describe('Signal-triggered shutdown', () => {
  let log: EventLog;
  let app: ReturnType<typeof buildSignalApp>;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
    app = buildSignalApp();
  });

  afterEach(async () => {
    await app.shutdown();
    activeLog.current = undefined;
  });

  it('exposes a CliConfig token that accepts SIGINT/SIGTERM handlers', async () => {
    const { get } = await app.ready({ warmup: true });
    const cli = get(CliConfig) as TestCliConfig;

    const handler = () => {};
    cli.onSignal('SIGINT', handler);
    cli.onSignal('SIGTERM', handler);

    expect(cli.handlerCount('SIGINT')).toBe(1);
    expect(cli.handlerCount('SIGTERM')).toBe(1);
  });

  it('invokes app.shutdown when a signal-bound handler fires', async () => {
    const { get } = await app.ready({ warmup: true });
    const cli = get(CliConfig) as TestCliConfig;
    const firstSpy = get(FirstSpy);

    let shutdownPromise: Promise<void> | undefined;
    const handler = () => {
      shutdownPromise = app.shutdown();
    };
    cli.onSignal('SIGINT', handler);

    expect(firstSpy.shutdownCalls).toBe(0);

    cli.emit('SIGINT');
    await shutdownPromise;

    expect(firstSpy.shutdownCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'first' && e.phase === 'shutdown')).toBe(true);
  });

  it('removes handlers via offSignal', async () => {
    const { get } = await app.ready({ warmup: true });
    const cli = get(CliConfig) as TestCliConfig;

    let calls = 0;
    const handler = () => {
      calls++;
    };
    cli.onSignal('SIGTERM', handler);
    cli.emit('SIGTERM');
    cli.offSignal('SIGTERM', handler);
    cli.emit('SIGTERM');

    expect(calls).toBe(1);
    expect(cli.handlerCount('SIGTERM')).toBe(0);
  });
});
