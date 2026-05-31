import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, WarmupSpy } from '../src/lifecycle-spy';

describe('Lifecycle warmup', () => {
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

  it('runs registered warmup handlers when ready({ warmup: true })', async () => {
    readyApp = await buildApp().ready({ warmup: true });
    const instance = await readyApp.get(WarmupSpy);

    expect(instance.warmupCalls).toBe(1);
    expect(log.events.some((e) => e.phase === 'warmup')).toBe(true);
  });

  it('runs all warmup handlers before completing ready()', async () => {
    readyApp = await buildApp().ready({ warmup: true });

    const phases = log.events.map((e) => e.phase);
    const lastWarmup = phases.lastIndexOf('warmup');

    expect(lastWarmup).toBeGreaterThanOrEqual(0);
    // No further warmup events appear after ready() resolves.
    expect(phases.slice(lastWarmup + 1)).not.toContain('warmup');
  });
});
