import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { getCommandMetadata } from '../internal/metadata';

import { Command } from './command';

describe('@Command', () => {
  it('stores command metadata (name, description)', () => {
    @Command({ name: 'deploy', description: 'Deploy the application' })
    class DeployCommand {}

    expect(getCommandMetadata(DeployCommand)).toEqual({
      name: 'deploy',
      description: 'Deploy the application',
    });
  });

  it('makes class injectable', () => {
    @Command({ name: 'build' })
    class BuildCommand {
      run() {
        return 'built';
      }
    }

    const container = new Container();
    container.bind(BuildCommand);
    expect(container.get(BuildCommand).run()).toBe('built');
  });

  it('works without description', () => {
    @Command({ name: 'migrate' })
    class MigrateCommand {}

    expect(getCommandMetadata(MigrateCommand)).toEqual({ name: 'migrate' });
  });
});
