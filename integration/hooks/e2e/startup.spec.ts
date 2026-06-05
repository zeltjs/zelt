import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, FirstSpy } from '../src/lifecycle-spy';

describe('Lifecycle startup', () => {
  let log: EventLog;
  let readyApp: Awaited<ReturnType<ReturnType<typeof buildApp>['createRuntime']>>;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
  });

  afterEach(async () => {
    await readyApp?.shutdown();
    activeLog.current = undefined;
  });

  it('calls startup on registered Lifecycle services when app becomes ready', async () => {
    readyApp = await buildApp().createRuntime({ warmup: true });
    const instance = await readyApp.get(FirstSpy);

    expect(instance.startupCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'first' && e.phase === 'startup')).toBe(true);
  });

  it('does not invoke startup again when createRuntime() is called repeatedly', async () => {
    const app = buildApp();
    await app.createRuntime({ warmup: true });
    await app.createRuntime({ warmup: true });
    readyApp = await app.createRuntime({ warmup: true });
    const instance = await readyApp.get(FirstSpy);

    expect(instance.startupCalls).toBe(1);
  });

  it('does not invoke startup before createRuntime() is called', () => {
    buildApp();
    expect(log.events.length).toBe(0);
  });
});
