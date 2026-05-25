import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog } from '../src/lifecycle-spy';

describe('Lifecycle ordering', () => {
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

  it('runs startup before shutdown across the lifetime', async () => {
    await app.ready({ warmup: true });
    await app.shutdown();

    const phases = log.events.map((e) => e.phase);
    const firstShutdownIdx = phases.indexOf('shutdown');
    const lastStartupIdx = phases.lastIndexOf('startup');

    expect(lastStartupIdx).toBeGreaterThanOrEqual(0);
    expect(firstShutdownIdx).toBeGreaterThan(lastStartupIdx);
  });

  it('shuts down in reverse registration order', async () => {
    await app.ready({ warmup: true });

    const startupOrder = log.events.filter((e) => e.phase === 'startup').map((e) => e.source);

    await app.shutdown();

    const shutdownOrder = log.events.filter((e) => e.phase === 'shutdown').map((e) => e.source);

    expect(shutdownOrder).toEqual([...startupOrder].reverse());
  });
});
