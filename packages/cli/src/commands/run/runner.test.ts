import { Command } from '@zeltjs/command';
import { describe, expect, it } from 'vitest';

import { CommandExecutionError, runCommand } from './runner';

describe('runCommand', () => {
  it('executes command with parsed args and options', async () => {
    const received: { name: string; verbose: boolean } = { name: '', verbose: false };

    class GreetCommandBase {
      readonly args = {
        name: { type: 'positional' as const, required: true as const },
      };
      readonly options = {
        verbose: { type: 'boolean' as const, default: false },
      };

      run(ctx: { args: Record<string, string | undefined>; options: Record<string, unknown> }) {
        received.name = ctx.args['name'] ?? '';
        received.verbose = ctx.options['verbose'] as boolean;
      }
    }

    const GreetCommand = Command({ name: 'greet' })(GreetCommandBase);

    await runCommand(GreetCommand, ['Alice', '--verbose']);

    expect(received.name).toBe('Alice');
    expect(received.verbose).toBe(true);
  });

  it('uses default values when args not provided', async () => {
    const received: { env: string } = { env: '' };

    class DeployCommandBase {
      readonly options = {
        env: { type: 'string' as const, default: 'production' },
      };

      run(ctx: { args: Record<string, string | undefined>; options: Record<string, unknown> }) {
        received.env = ctx.options['env'] as string;
      }
    }

    const DeployCommand = Command({ name: 'deploy' })(DeployCommandBase);

    await runCommand(DeployCommand, []);

    expect(received.env).toBe('production');
  });

  it('throws CommandExecutionError when command throws', async () => {
    class FailingCommandBase {
      run() {
        throw new Error('Command failed');
      }
    }

    const FailingCommand = Command({ name: 'fail' })(FailingCommandBase);

    await expect(runCommand(FailingCommand, [])).rejects.toThrow(CommandExecutionError);
  });
});
