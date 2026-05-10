import { args, cliSchema, Command } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import {
  CommandExecutionError,
  InvalidNumberError,
  runCommand,
  SchemaValidationError,
} from './runner';

const getArgsFromContext = (cmd: unknown): unknown => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return args(cmd as any);
  } catch {
    return {};
  }
};

describe('runCommand', () => {
  it('parses positional args from schema', async () => {
    const received: { target: string } = { target: '' };

    class GreetCommandBase {
      static schema = cliSchema({
        args: [{ name: 'target', type: 'string' }],
      });

      run() {
        const ctx = getArgsFromContext(GreetCommandBase) as { target: string };
        received.target = ctx.target;
      }
    }
    Command({ name: 'greet' })(GreetCommandBase);

    await runCommand(GreetCommandBase, ['world']);

    expect(received.target).toBe('world');
  });

  it('parses options with alias from schema', async () => {
    const received: { verbose: boolean } = { verbose: false };

    class TestCommand {
      static schema = cliSchema({
        options: [{ name: 'verbose', type: 'boolean', alias: 'v' }],
      });

      run() {
        const ctx = getArgsFromContext(TestCommand) as { verbose: boolean };
        received.verbose = ctx.verbose;
      }
    }
    Command({ name: 'test' })(TestCommand);

    await runCommand(TestCommand, ['-v']);

    expect(received.verbose).toBe(true);
  });

  it('converts number type args', async () => {
    const received: { port: number } = { port: 0 };

    class ServeCommand {
      static schema = cliSchema({
        options: [{ name: 'port', type: 'number', default: 3000 }],
      });

      run() {
        const ctx = getArgsFromContext(ServeCommand) as { port: number };
        received.port = ctx.port;
      }
    }
    Command({ name: 'serve' })(ServeCommand);

    await runCommand(ServeCommand, ['--port', '8080']);

    expect(received.port).toBe(8080);
    expect(typeof received.port).toBe('number');
  });

  it('uses default value for number option', async () => {
    const received: { port: number } = { port: 0 };

    class ServeCommand {
      static schema = cliSchema({
        options: [{ name: 'port', type: 'number', default: 3000 }],
      });

      run() {
        const ctx = getArgsFromContext(ServeCommand) as { port: number };
        received.port = ctx.port;
      }
    }
    Command({ name: 'serve' })(ServeCommand);

    await runCommand(ServeCommand, []);

    expect(received.port).toBe(3000);
  });

  it('throws InvalidNumberError for invalid number', async () => {
    class ServeCommand {
      static schema = cliSchema({
        options: [{ name: 'port', type: 'number' }],
      });

      run() {}
    }
    Command({ name: 'serve' })(ServeCommand);

    await expect(runCommand(ServeCommand, ['--port', 'abc'])).rejects.toThrow(InvalidNumberError);
  });

  it('handles optional positional args', async () => {
    const received: { target: string; message: string | undefined } = {
      target: '',
      message: undefined,
    };

    class GreetCommand {
      static schema = cliSchema({
        args: [
          { name: 'target', type: 'string' },
          { name: 'message', type: 'string', optional: true },
        ],
      });

      run() {
        const ctx = getArgsFromContext(GreetCommand) as { target: string; message?: string };
        received.target = ctx.target;
        received.message = ctx.message;
      }
    }
    Command({ name: 'greet' })(GreetCommand);

    await runCommand(GreetCommand, ['world']);

    expect(received.target).toBe('world');
    expect(received.message).toBeUndefined();
  });

  it('combines args and options', async () => {
    const received: { target: string; port: number; verbose: boolean } = {
      target: '',
      port: 0,
      verbose: false,
    };

    class DeployCommand {
      static schema = cliSchema({
        args: [{ name: 'target', type: 'string' }],
        options: [
          { name: 'port', type: 'number', default: 3000 },
          { name: 'verbose', type: 'boolean' },
        ],
      });

      run() {
        const ctx = getArgsFromContext(DeployCommand) as {
          target: string;
          port: number;
          verbose: boolean;
        };
        received.target = ctx.target;
        received.port = ctx.port;
        received.verbose = ctx.verbose;
      }
    }
    Command({ name: 'deploy' })(DeployCommand);

    await runCommand(DeployCommand, ['production', '--port', '8080', '--verbose']);

    expect(received.target).toBe('production');
    expect(received.port).toBe(8080);
    expect(received.verbose).toBe(true);
  });

  it('throws CommandExecutionError when command throws', async () => {
    class FailingCommand {
      static schema = cliSchema({});

      run() {
        throw new Error('Command failed');
      }
    }
    Command({ name: 'fail' })(FailingCommand);

    await expect(runCommand(FailingCommand, [])).rejects.toThrow(CommandExecutionError);
  });
});

describe('schema validation', () => {
  it('throws SchemaValidationError when args and options have same name', async () => {
    class TestCommand {
      static schema = cliSchema({
        args: [{ name: 'port', type: 'string' }],
        options: [{ name: 'port', type: 'number' }],
      });

      run() {}
    }
    Command({ name: 'test' })(TestCommand);

    await expect(runCommand(TestCommand, [])).rejects.toThrow(SchemaValidationError);
  });
});
