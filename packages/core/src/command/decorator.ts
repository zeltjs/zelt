import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../internal/decorator-context';

import { setCommandMetadata, type CommandMetadata } from './metadata';

type CommandOptions = {
  readonly name: string;
  readonly description?: string;
};

export const Command =
  (options: CommandOptions) =>
  (...args: unknown[]): void => {
    const { cls, injectableClass } = resolveClassArgs(args);
    const meta: CommandMetadata = options.description
      ? { name: options.name, description: options.description }
      : { name: options.name };
    setCommandMetadata(cls, meta);
    injectable()(injectableClass);
  };
