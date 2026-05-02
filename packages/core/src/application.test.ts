import { injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { createApp } from './application';

@injectable()
class Service {}

describe('createApp', () => {
  it('returns an Application exposing http() function', () => {
    const app = createApp({ providers: [Service] });
    expect(typeof app.http).toBe('function');
  });

  it('does not expose the underlying container as a public field', () => {
    const app = createApp({ providers: [] });
    expect((app as { container?: unknown }).container).toBeUndefined();
  });
});
