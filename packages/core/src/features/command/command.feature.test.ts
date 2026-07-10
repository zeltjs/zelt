import { Container } from '@needle-di/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { CommandFeature, command } from './command.feature';
import { Command } from './definition/command.decorator';
import { cliSchema } from './input/command-schema.types';

const createRuntime = (container: Container) => ({
  get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => container.get(cls),
  registerShutdown: (callback: () => void | Promise<void>) => async () => callback(),
});

@Command({ name: 'greet' })
class GreetCommand {
  static schema = cliSchema({});
  run() {}
}

describe('command feature', () => {
  it('command() returns CommandFeature instance', () => {
    const feature = command([GreetCommand]);

    expect(feature).toBeInstanceOf(CommandFeature);
    expect(feature.key).toBe('commands');
  });

  it('infers command() as CommandFeature', () => {
    expectTypeOf(command([GreetCommand])).toEqualTypeOf<CommandFeature>();
  });

  it('keeps feature methods callable when destructured', () => {
    const feature = command([GreetCommand]);
    const { blueprint } = feature;

    expect(() => blueprint()).not.toThrow();
  });

  it('returns a ConfiguredFeature with key "commands"', () => {
    const feature = command([GreetCommand]);
    expect(feature.key).toBe('commands');
    expect(feature.featureClasses()).toEqual([GreetCommand]);
    expect(typeof feature.realize).toBe('function');
  });

  it('realize returns CommandCapabilities', async () => {
    const feature = command([GreetCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));
    expect(typeof caps.hasCommand).toBe('function');
    expect(typeof caps.getCommands).toBe('function');
    expect(typeof caps.execCommand).toBe('function');
  });

  it('caps.hasCommand detects registered commands', async () => {
    const feature = command([GreetCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    expect(caps.hasCommand('greet')).toBe(true);
    expect(caps.hasCommand('unknown')).toBe(false);
  });

  it('caps.execCommand runs a registered command', async () => {
    const feature = command([GreetCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['greet']);
    expect(result.exitCode).toBe(0);
  });
});
