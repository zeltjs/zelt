import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { LifecycleManager } from '../../kernel';
import { command } from './command.feature';
import { Command } from './definition/command.decorator';
import { cliSchema } from './input/command-schema.types';

const createRuntime = (container: Container) => ({
  get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => container.get(cls),
});

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() {}
}

describe('command feature', () => {
  it('returns a ConfiguredFeature with key "commands"', () => {
    const feature = command([GreetCommand]);
    expect(feature.key).toBe('commands');
    expect(typeof feature.bind).toBe('function');
    expect(typeof feature.createCapabilities).toBe('function');
  });

  it('createCapabilities returns CommandCapabilities', async () => {
    const feature = command([GreetCommand]);
    const container = new Container();
    feature.bind(container);
    const caps = await feature.createCapabilities(createRuntime(container));
    expect(typeof caps.hasCommand).toBe('function');
    expect(typeof caps.getCommands).toBe('function');
    expect(typeof caps.execCommand).toBe('function');
  });

  it('caps.hasCommand detects registered commands', async () => {
    const feature = command([GreetCommand]);
    const container = new Container();
    feature.bind(container);
    const caps = await feature.createCapabilities(createRuntime(container));

    expect(caps.hasCommand('greet')).toBe(true);
    expect(caps.hasCommand('unknown')).toBe(false);
  });

  it('caps.execCommand runs a registered command', async () => {
    const feature = command([GreetCommand]);
    const container = new Container();
    feature.bind(container);
    const caps = await feature.createCapabilities(createRuntime(container));

    const lifecycle = container.get(LifecycleManager);
    await lifecycle.startup();

    const result = await caps.execCommand(['greet']);
    expect(result.exitCode).toBe(0);

    await lifecycle.shutdown();
  });
});
