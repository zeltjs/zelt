import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, WarmupSpy } from '../src/lifecycle-spy';

describe('Lifecycle warmup', () => {
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

  it('runs registered warmup handlers when ready({ warmup: true })', async () => {
    const { get } = await app.ready({ warmup: true });
    const instance = get(WarmupSpy);

    expect(instance.warmupCalls).toBe(1);
    expect(log.events.some((e) => e.phase === 'warmup')).toBe(true);
  });

  it('runs all warmup handlers before completing ready()', async () => {
    await app.ready({ warmup: true });

    const phases = log.events.map((e) => e.phase);
    const lastWarmup = phases.lastIndexOf('warmup');

    expect(lastWarmup).toBeGreaterThanOrEqual(0);
    // No further warmup events appear after ready() resolves.
    expect(phases.slice(lastWarmup + 1)).not.toContain('warmup');
  });
});
