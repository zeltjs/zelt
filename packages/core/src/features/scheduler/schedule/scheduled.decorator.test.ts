import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { getScheduledMetadata } from '../index';

import { Scheduled } from './scheduled.decorator';

describe('@Scheduled', () => {
  it('marks class as scheduled', () => {
    @Scheduled()
    class TestScheduler {}

    expect(getScheduledMetadata(TestScheduler)).toBe(true);
  });

  it('makes class injectable', () => {
    @Scheduled()
    class TestScheduler {
      hello() {
        return 'scheduled';
      }
    }

    const container = new Container();
    container.bind(TestScheduler);
    expect(container.get(TestScheduler).hello()).toBe('scheduled');
  });
});
