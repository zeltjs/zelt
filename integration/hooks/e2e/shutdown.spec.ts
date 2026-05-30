import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, FirstSpy } from '../src/lifecycle-spy';

describe('Lifecycle shutdown', () => {
  let log: EventLog;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
    app = buildApp();
  });

  afterEach(() => {
    activeLog.current = undefined;
  });

  it('calls shutdown on Lifecycle services when app shuts down', async () => {
    const { get } = await app.ready({ warmup: true });
    const instance = await get(FirstSpy);
    expect(instance.shutdownCalls).toBe(0);

    await app.shutdown();

    expect(instance.shutdownCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'first' && e.phase === 'shutdown')).toBe(true);
  });

  it('is idempotent: subsequent shutdown calls do not re-run hooks', async () => {
    const { get } = await app.ready({ warmup: true });
    const instance = await get(FirstSpy);

    await app.shutdown();
    await app.shutdown();

    expect(instance.shutdownCalls).toBe(1);
  });
});
