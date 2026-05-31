import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, FirstSpy } from '../src/lifecycle-spy';

describe('Lifecycle startup', () => {
  let log: EventLog;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
    app = buildApp();
  });

  afterEach(async () => {
    await app.shutdown();
    activeLog.current = undefined;
  });

  it('calls startup on registered Lifecycle services when app becomes ready', async () => {
    const { get } = await app.ready({ warmup: true });
    const instance = await get(FirstSpy);

    expect(instance.startupCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'first' && e.phase === 'startup')).toBe(true);
  });

  it('does not invoke startup again when ready() is called repeatedly', async () => {
    await app.ready({ warmup: true });
    await app.ready({ warmup: true });
    const { get } = await app.ready({ warmup: true });
    const instance = await get(FirstSpy);

    expect(instance.startupCalls).toBe(1);
  });

  it('does not invoke startup before ready() is called', () => {
    expect(log.events.length).toBe(0);
  });
});
