import { injectable } from '@needle-di/core';

import { setCommandMetadata, type CommandMetadata } from '../internal/metadata';

type AnyClass = new (...args: never[]) => object;

type CommandOptions = {
  readonly name: string;
  readonly description?: string;
};

export const Command =
  (options: CommandOptions) =>
  <T extends AnyClass>(target: T): T => {
    const meta: CommandMetadata = options.description
      ? { name: options.name, description: options.description }
      : { name: options.name };
    setCommandMetadata(target, meta);
    // injectable() returns T | void; void is the decorator protocol's "no replacement" signal
    const wrapped: T | void = injectable<T>()(target);
    return wrapped ?? target;
  };
