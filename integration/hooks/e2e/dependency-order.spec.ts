import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDependencyApp } from '../src/app';
import { DependencyA, DependencyB, NoHookService } from '../src/dependency-spy';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog } from '../src/lifecycle-spy';

describe('DI dependency-driven lifecycle order', () => {
  let log: EventLog;
  let app: ReturnType<typeof buildDependencyApp>;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
    app = buildDependencyApp();
  });

  afterEach(async () => {
    await app.shutdown();
    activeLog.current = undefined;
  });

  it('starts up dependencies before dependents (B before A when A injects B)', async () => {
    await app.ready({ warmup: true });

    const startupOrder = log.events.filter((e) => e.phase === 'startup').map((e) => e.source);

    const idxB = startupOrder.indexOf('dependency-b');
    const idxA = startupOrder.indexOf('dependency-a');

    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeGreaterThan(idxB);
  });

  it('shuts down dependents before dependencies (A before B)', async () => {
    await app.ready({ warmup: true });
    await app.shutdown();

    const shutdownOrder = log.events.filter((e) => e.phase === 'shutdown').map((e) => e.source);

    const idxA = shutdownOrder.indexOf('dependency-a');
    const idxB = shutdownOrder.indexOf('dependency-b');

    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThan(idxA);
  });

  it('resolves DependencyA with its DependencyB wired through constructor injection', async () => {
    const { get } = await app.ready({ warmup: true });
    const a = await get(DependencyA);
    const b = await get(DependencyB);

    expect(a.b).toBe(b);
  });
});

describe('Services without lifecycle hooks', () => {
  let log: EventLog;
  let app: ReturnType<typeof buildDependencyApp>;

  beforeEach(() => {
    log = createEventLog();
    activeLog.current = log;
    app = buildDependencyApp();
  });

  afterEach(async () => {
    await app.shutdown();
    activeLog.current = undefined;
  });

  it('coexist with Lifecycle services without triggering errors during startup or shutdown', async () => {
    const { get } = await app.ready({ warmup: true });
    const noHook = await get(NoHookService);

    expect(noHook.ping()).toBe('pong');

    await expect(app.shutdown()).resolves.toBeUndefined();
  });

  it('does not emit lifecycle events for services that never register with LifecycleManager', async () => {
    await app.ready({ warmup: true });
    await app.shutdown();

    const sources = new Set(log.events.map((e) => e.source));
    expect(sources.has('no-hook')).toBe(false);
  });
});
