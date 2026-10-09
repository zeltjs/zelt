import { Container } from '@needle-di/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { ZeltCommandExecutionError, ZeltContextNotAvailableError } from '../../kernel';
import { CommandFeature, command } from './command.feature';
import { Command } from './definition/command.decorator';
import { cliSchema } from './input';
import { args } from './input/injection';

const createRuntime = (container: Container) => ({
  get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => container.get(cls),
  registerShutdown: (callback: () => void | Promise<void>) => async () => callback(),
});

@Command({ name: 'greet' })
class GreetCommand {
  run() {}
}

const echoSchema = cliSchema({ args: [{ name: 'target', type: 'string' }] });

@Command({ name: 'echo' })
class EchoCommand {
  run(ctx = args(echoSchema)) {
    void ctx.target;
  }
}

@Command({ name: 'fail' })
class FailCommand {
  run() {
    throw new Error('boom');
  }
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

  it('caps.execCommand parses argv via args(schema)', async () => {
    const feature = command([EchoCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['echo', 'world']);
    expect(result.exitCode).toBe(0);
  });

  it('caps.execCommand reports argv_parse_error without wrapping it as run_error', async () => {
    const feature = command([EchoCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['echo']);
    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.reason).toBeInstanceOf(ZeltCommandExecutionError);
      expect((result.reason as ZeltCommandExecutionError).context.reason).toBe('argv_parse_error');
    }
  });

  it('caps.execCommand reports run_error for exceptions raised inside run()', async () => {
    const feature = command([FailCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['fail']);
    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.reason).toBeInstanceOf(ZeltCommandExecutionError);
      expect((result.reason as ZeltCommandExecutionError).context.reason).toBe('run_error');
    }
  });

  it('returns the same parsed result when args(schema) is called twice in run()', async () => {
    const calls: unknown[] = [];

    @Command({ name: 'echo-twice' })
    class EchoTwiceCommand {
      run() {
        calls.push(args(echoSchema));
        calls.push(args(echoSchema));
      }
    }

    const feature = command([EchoTwiceCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['echo-twice', 'world']);
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ target: 'world' });
    expect(calls[1]).toEqual({ target: 'world' });
  });

  it('keeps the command context alive after an await inside run()', async () => {
    let captured: unknown;

    @Command({ name: 'echo-after-await' })
    class EchoAfterAwaitCommand {
      async run() {
        await Promise.resolve();
        captured = args(echoSchema);
      }
    }

    const feature = command([EchoAfterAwaitCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['echo-after-await', 'world']);
    expect(result.exitCode).toBe(0);
    expect(captured).toEqual({ target: 'world' });
  });

  it('reports run_error when args(schema) is called from a constructor default (no context yet)', async () => {
    @Command({ name: 'echo-ctor' })
    class EchoCtorCommand {
      constructor(private readonly ctx = args(echoSchema)) {}
      run() {
        void this.ctx;
      }
    }

    const feature = command([EchoCtorCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['echo-ctor', 'world']);
    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.reason).toBeInstanceOf(ZeltCommandExecutionError);
      expect(result.reason.context.reason).toBe('run_error');
      expect(result.reason.cause).toBeInstanceOf(ZeltContextNotAvailableError);
    }
  });

  it('wraps a user-thrown ZeltCommandExecutionError from run() with the current commandName, keeping it as cause', async () => {
    @Command({ name: 'echo-user-error' })
    class EchoUserErrorCommand {
      run() {
        throw new ZeltCommandExecutionError({ reason: 'run_error', commandName: 'other' });
      }
    }

    const feature = command([EchoUserErrorCommand]);
    const container = new Container();
    const caps = await feature.realize(createRuntime(container));

    const result = await caps.execCommand(['echo-user-error']);
    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.reason).toBeInstanceOf(ZeltCommandExecutionError);
      expect(result.reason.context.reason).toBe('run_error');
      expect(result.reason.context.commandName).toBe('echo-user-error');
      expect(result.reason.cause).toBeInstanceOf(ZeltCommandExecutionError);
      expect((result.reason.cause as ZeltCommandExecutionError).context.commandName).toBe('other');
    }
  });
});
