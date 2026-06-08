import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, WarmupSpy } from '../src/lifecycle-spy';

describe('Lifecycle warmup', () => {
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

  it('eagerly resolves feature classes when createRuntime({ warmup: true })', async () => {
    readyApp = await buildApp().createRuntime({ warmup: true });
    const instance = await readyApp.get(WarmupSpy);

    expect(instance.warmupCalls).toBe(1);
    expect(log.events.some((e) => e.phase === 'warmup')).toBe(true);
  });

  it('resolves all warmup targets before completing createRuntime()', async () => {
    readyApp = await buildApp().createRuntime({ warmup: true });

    const phases = log.events.map((e) => e.phase);
    const lastWarmup = phases.lastIndexOf('warmup');

    expect(lastWarmup).toBeGreaterThanOrEqual(0);
    // No further warmup events appear after createRuntime() resolves.
    expect(phases.slice(lastWarmup + 1)).not.toContain('warmup');
  });
});
