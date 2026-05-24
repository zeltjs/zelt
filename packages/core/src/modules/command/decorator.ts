import { registerAsTransient } from '../../kernel/di/transient';
import { defineInjectableClassDecorator } from '../../kernel/internal/decorator-helpers';
import { captureStackTraceForCore } from '../../kernel/internal/decorator-position';

type CommandOptions = {
  readonly name: string;
  readonly description?: string;
};

export const Command = (options: CommandOptions) =>
  defineInjectableClassDecorator(
    captureStackTraceForCore(),
    options.description
      ? {
          decorator: 'Command' as const,
          name: options.name,
          description: options.description,
        }
      : { decorator: 'Command' as const, name: options.name },
    { afterApply: registerAsTransient },
    { unique: true },
  );
