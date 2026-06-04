import { getClassMetadata } from '@zeltjs/decorator-metadata';
import { match, P } from 'ts-pattern';

export type CommandMetadata = {
  readonly name: string;
  readonly description?: string;
};

const commandPattern = {
  decorator: 'Command' as const,
  name: P.string,
  description: P.optional(P.string),
};

/** @throws {ZeltLifecycleStateError} */
export const getCommandMetadata = (cls: object): CommandMetadata | undefined => {
  const meta = getClassMetadata(cls);
  if (!meta) return undefined;
  for (const p of meta.props) {
    const found = match(p)
      .with(
        commandPattern,
        (c): CommandMetadata =>
          c.description !== undefined
            ? { name: c.name, description: c.description }
            : { name: c.name },
      )
      .otherwise(() => undefined);
    if (found) return found;
  }
  return undefined;
};
