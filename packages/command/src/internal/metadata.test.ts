import { describe, expect, it } from 'vitest';

import { getCommandMetadata, setCommandMetadata } from './metadata';

describe('command metadata', () => {
  it('stores and retrieves command metadata', () => {
    class DeployCommand {}

    setCommandMetadata(DeployCommand, { name: 'deploy', description: 'Deploy the app' });

    expect(getCommandMetadata(DeployCommand)).toEqual({
      name: 'deploy',
      description: 'Deploy the app',
    });
  });

  it('returns undefined for unmarked class', () => {
    class UnmarkedCommand {}

    expect(getCommandMetadata(UnmarkedCommand)).toBeUndefined();
  });
});
