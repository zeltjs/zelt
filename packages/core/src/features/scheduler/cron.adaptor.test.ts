import { describe, expect, it, vi } from 'vitest';
import { CronAdaptor } from './cron.adaptor';

// Real croner timers under test; a far-future expression keeps the tests from
// racing an actual tick since nothing here waits on wall-clock time. Every
// test stops its handle before finishing so no timer leaks into other files.
const neverFiresThisTest = '0 0 1 1 *';

describe('CronAdaptor', () => {
  it('returns a handle with a stop function', () => {
    const adaptor = new CronAdaptor();
    const handle = adaptor.schedule(neverFiresThisTest, {}, () => {});

    expect(handle.stop).toBeInstanceOf(Function);
    handle.stop();
  });

  it('does not call the handler synchronously when scheduling', () => {
    const adaptor = new CronAdaptor();
    const handler = vi.fn();

    const handle = adaptor.schedule(neverFiresThisTest, {}, handler);

    expect(handler).not.toHaveBeenCalled();
    handle.stop();
  });

  it('allows stop() to be called more than once without throwing', () => {
    const adaptor = new CronAdaptor();
    const handle = adaptor.schedule(neverFiresThisTest, {}, () => {});

    expect(() => {
      handle.stop();
      handle.stop();
    }).not.toThrow();
  });

  it('accepts a timezone option', () => {
    const adaptor = new CronAdaptor();
    const handle = adaptor.schedule(neverFiresThisTest, { timezone: 'Asia/Tokyo' }, () => {});

    expect(handle.stop).toBeInstanceOf(Function);
    handle.stop();
  });
});
