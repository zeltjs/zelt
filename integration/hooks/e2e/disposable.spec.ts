import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, DisposableSpy } from '../src/lifecycle-spy';

describe('Disposable shutdown', () => {
  let log: EventLog;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
  });

  afterEach(() => {
    activeLog.current = undefined;
  });

  it('invokes Disposable.shutdown when the app shuts down', async () => {
    const readyApp = await buildApp().createRuntime({ warmup: true });
    const instance = await readyApp.get(DisposableSpy);
    expect(instance.shutdownCalls).toBe(0);

    await readyApp.shutdown();

    expect(instance.shutdownCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'disposable' && e.phase === 'shutdown')).toBe(true);
  });
});
