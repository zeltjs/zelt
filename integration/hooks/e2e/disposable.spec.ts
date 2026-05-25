import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { EventLog } from '../src/lifecycle-spy';
import { activeLog, createEventLog, DisposableSpy } from '../src/lifecycle-spy';

describe('Disposable shutdown', () => {
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

  it('invokes Disposable.shutdown when the app shuts down', async () => {
    const { get } = await app.ready({ warmup: true });
    const instance = get(DisposableSpy);
    expect(instance.shutdownCalls).toBe(0);

    await app.shutdown();

    expect(instance.shutdownCalls).toBe(1);
    expect(log.events.some((e) => e.source === 'disposable' && e.phase === 'shutdown')).toBe(true);
  });
});
