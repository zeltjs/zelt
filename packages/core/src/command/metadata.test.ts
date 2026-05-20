import { describe, expect, it } from 'vitest';

import { Command } from './decorator';
import { getCommandMetadata } from './metadata';

describe('command metadata (via decorator)', () => {
  it('stores and retrieves command metadata with description', () => {
    @Command({ name: 'deploy', description: 'Deploy the app' })
    class DeployCommand {}

    expect(getCommandMetadata(DeployCommand)).toEqual({
      name: 'deploy',
      description: 'Deploy the app',
    });
  });

  it('omits description when not provided', () => {
    @Command({ name: 'build' })
    class BuildCommand {}

    expect(getCommandMetadata(BuildCommand)).toEqual({ name: 'build' });
  });

  it('returns undefined for unmarked class', () => {
    class UnmarkedCommand {}
    expect(getCommandMetadata(UnmarkedCommand)).toBeUndefined();
  });
});
