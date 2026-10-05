import { describe, expect, it, vi } from 'vitest';

import { runInContext } from '../../../kernel';
import {
  flushAfterResponseCallbacks,
  initializeAfterResponseCallbacks,
  registerAfterResponseCallback,
} from './after-response.lib';

describe('after-response callbacks', () => {
  it('does not throw when flushing outside any context', () => {
    expect(() => flushAfterResponseCallbacks()).not.toThrow();
  });

  it('returns false outside any context', () => {
    expect(registerAfterResponseCallback(() => {})).toBe(false);
  });

  it('returns false outside an initialized request context', () => {
    runInContext(() => {
      expect(registerAfterResponseCallback(() => {})).toBe(false);
    });
  });

  it('closes an empty registry and returns a completion promise', async () => {
    let completion: Promise<void> | undefined;
    runInContext(() => {
      initializeAfterResponseCallbacks();
      completion = flushAfterResponseCallbacks();

      expect(registerAfterResponseCallback(() => {})).toBe(false);
    });
    expect(completion).toBeInstanceOf(Promise);
    await expect(completion).resolves.toBeUndefined();
  });

  it('runs callbacks once for each registration', async () => {
    vi.useFakeTimers();
    try {
      const callback = vi.fn();

      runInContext(() => {
        initializeAfterResponseCallbacks();
        expect(registerAfterResponseCallback(callback)).toBe(true);
        expect(registerAfterResponseCallback(callback)).toBe(true);
        void flushAfterResponseCallbacks();
      });

      await vi.runOnlyPendingTimersAsync();

      expect(callback).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts callbacks in a macrotask after flush returns', async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];

      runInContext(() => {
        initializeAfterResponseCallbacks();
        registerAfterResponseCallback(() => {
          events.push('started');
        });
        void flushAfterResponseCallbacks();
      });

      await Promise.resolve();
      expect(events).toEqual([]);

      await vi.runOnlyPendingTimersAsync();
      expect(events).toEqual(['started']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps flushed callbacks isolated from registration and another request', async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      let first!: Promise<void>;
      let second!: Promise<void>;

      runInContext(() => {
        initializeAfterResponseCallbacks();
        registerAfterResponseCallback(() => {
          events.push('first');
          expect(
            registerAfterResponseCallback(() => {
              events.push('late');
            }),
          ).toBe(false);
        });
        first = flushAfterResponseCallbacks();
        expect(
          registerAfterResponseCallback(() => {
            events.push('late');
          }),
        ).toBe(false);
        void flushAfterResponseCallbacks();
      });
      runInContext(() => {
        initializeAfterResponseCallbacks();
        registerAfterResponseCallback(() => {
          events.push('second');
        });
        second = flushAfterResponseCallbacks();
      });

      await vi.runOnlyPendingTimersAsync();
      await Promise.all([first, second]);
      expect(events).toEqual(['first', 'second']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares registration and flush state with nested contexts', async () => {
    vi.useFakeTimers();
    try {
      const callback = vi.fn();
      let completion!: Promise<void>;
      runInContext(() => {
        initializeAfterResponseCallbacks();
        runInContext(() => {
          expect(registerAfterResponseCallback(callback)).toBe(true);
        });
        runInContext(() => {
          completion = flushAfterResponseCallbacks();
        });
        expect(registerAfterResponseCallback(callback)).toBe(false);
        void flushAfterResponseCallbacks();
      });

      await vi.runOnlyPendingTimersAsync();
      await completion;
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes registered callbacks once without awaiting them', async () => {
    const events: string[] = [];
    let releaseCallback!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCallback = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      runInContext(() => {
        initializeAfterResponseCallbacks();
        expect(
          registerAfterResponseCallback(async () => {
            events.push('started');
            await gate;
            events.push('finished');
            resolve();
          }),
        ).toBe(true);

        void flushAfterResponseCallbacks();
        void flushAfterResponseCallbacks();
      });
    });

    await vi.waitFor(() => expect(events).toEqual(['started']));
    expect(events).toEqual(['started']);
    releaseCallback();
    await pending;
    expect(events).toEqual(['started', 'finished']);
  });

  it('returns a promise that resolves only after every callback has completed', async () => {
    const events: string[] = [];
    let releaseCallback!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCallback = resolve;
    });

    let flushed!: Promise<void>;
    runInContext(() => {
      initializeAfterResponseCallbacks();
      registerAfterResponseCallback(async () => {
        events.push('started');
        await gate;
        events.push('finished');
      });

      flushed = flushAfterResponseCallbacks();
    });

    let settled = false;
    void flushed.then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(events).toEqual(['started']));
    expect(settled).toBe(false);

    releaseCallback();
    await flushed;

    expect(settled).toBe(true);
    expect(events).toEqual(['started', 'finished']);
  });

  it('captures callback rejections through the provided error handler', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const error = new Error('boom');

    try {
      runInContext(() => {
        initializeAfterResponseCallbacks();
        registerAfterResponseCallback(async () => {
          throw error;
        });
        void flushAfterResponseCallbacks(onError);
      });

      await vi.runOnlyPendingTimersAsync();
      expect(onError).toHaveBeenCalledWith(error);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores secondary errors thrown by the error handler', async () => {
    vi.useFakeTimers();
    const primaryError = new Error('primary');
    const secondaryError = new Error('secondary');
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);

    try {
      runInContext(() => {
        initializeAfterResponseCallbacks();
        registerAfterResponseCallback(async () => {
          throw primaryError;
        });
        void flushAfterResponseCallbacks(() => {
          throw secondaryError;
        });
      });

      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();

      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
      vi.useRealTimers();
    }
  });
});
