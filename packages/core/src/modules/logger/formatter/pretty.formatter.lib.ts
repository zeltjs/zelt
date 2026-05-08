import type { LogLevel } from '../index';

export const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

export const RESET = '\x1b[0m';

export const isTTY = (): boolean =>
  typeof process !== 'undefined' &&
  process.stdout.isTTY === true &&
  process.env['NO_COLOR'] === undefined;
