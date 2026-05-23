import { registerAsTransient } from '../di/transient';
import { defineInjectableClassDecorator } from '../internal/decorator-helpers';
import { captureStackTraceForCore } from '../internal/decorator-position';

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
