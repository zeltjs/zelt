import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, FirstSpy } from '../src/lifecycle-spy';

describe('Lifecycle startup', () => {
  let log: EventLog;
  let readyApp: Awaited<ReturnType<ReturnType<typeof buildApp>['ready']>>;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
  });

  afterEach(async () => {
    await readyApp?.shutdown();
    activeLog.current = undefined;
  });

  it('calls startup on registered Lifecycle services when app becomes ready', async () => {
    readyApp = await buildApp().ready({ warmup: true });
    const instance = await readyApp.get(FirstSpy);

    expect(instance.startupCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'first' && e.phase === 'startup')).toBe(true);
  });

  it('does not invoke startup again when ready() is called repeatedly', async () => {
    const app = buildApp();
    await app.ready({ warmup: true });
    await app.ready({ warmup: true });
    readyApp = await app.ready({ warmup: true });
    const instance = await readyApp.get(FirstSpy);

    expect(instance.startupCalls).toBe(1);
  });

  it('does not invoke startup before ready() is called', () => {
    buildApp();
    expect(log.events.length).toBe(0);
  });
});
