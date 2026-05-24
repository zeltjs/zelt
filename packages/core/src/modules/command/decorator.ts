import { registerAsTransient } from '../../kernel/di/transient';
import { createInjectableClassDecorator } from '../../kernel/internal/decorator-helpers';

type CommandOptions = {
  readonly name: string;
  readonly description?: string;
};

export const Command = (options: CommandOptions) =>
  createInjectableClassDecorator(
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
