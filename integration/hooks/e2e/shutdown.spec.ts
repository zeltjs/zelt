import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, FirstSpy } from '../src/lifecycle-spy';

describe('Lifecycle shutdown', () => {
  let log: EventLog;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
  });

  afterEach(() => {
    activeLog.current = undefined;
  });

  it('calls shutdown on Lifecycle services when app shuts down', async () => {
    const readyApp = await buildApp().ready({ warmup: true });
    const instance = await readyApp.get(FirstSpy);
    expect(instance.shutdownCalls).toBe(0);

    await readyApp.shutdown();

    expect(instance.shutdownCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'first' && e.phase === 'shutdown')).toBe(true);
  });

  it('is idempotent: subsequent shutdown calls do not re-run hooks', async () => {
    const readyApp = await buildApp().ready({ warmup: true });
    const instance = await readyApp.get(FirstSpy);

    await readyApp.shutdown();
    await readyApp.shutdown();

    expect(instance.shutdownCalls).toBe(1);
  });
});
