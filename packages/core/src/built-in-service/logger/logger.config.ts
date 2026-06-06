import { inject } from '../../kernel';
import { Config } from '../config';

import type { LoggerFormatter } from './formatter';
import { JsonlFormatter } from './formatter';
import type { LogLevel } from './logger.types';
import type { LoggerTransport } from './transport';
import { ConsoleTransport } from './transport';

export type TransportBinding = {
  readonly transport: LoggerTransport;
  readonly formatter: LoggerFormatter;
};

@Config
export class LoggerConfig {
  static readonly Token = LoggerConfig;

  private readonly _transports: readonly TransportBinding[];

  constructor(
    private readonly console = inject(ConsoleTransport),
    private readonly jsonl = inject(JsonlFormatter),
  ) {
    this._transports = Object.freeze([{ transport: this.console, formatter: this.jsonl }]);
  }

  get level(): LogLevel {
    return 'info';
  }

  get transports(): readonly TransportBinding[] {
    return this._transports;
  }
}
