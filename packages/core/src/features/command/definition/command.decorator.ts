import { createInjectableClassDecorator, registerAsTransient } from '../../../kernel';

type CommandOptions = {
  readonly name: string;
  readonly description?: string;
};

/** @throws {E} */
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
