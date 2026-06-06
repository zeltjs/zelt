import { Injectable } from '../../../kernel';

import type { LoggerTransport } from './transport.types';

@Injectable()
export class ConsoleTransport implements LoggerTransport {
  write(formatted: string): void {
    console.log(formatted);
  }
}
