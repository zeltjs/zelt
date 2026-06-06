import { ZeltNotImplementedError } from '../../kernel';
import { Config } from '../config';

export type Signal = 'SIGINT' | 'SIGTERM';
export type SignalHandler = () => void;

@Config
export class CliConfig {
  /** @throws {ZeltNotImplementedError} */
  cwd(): string {
    throw new ZeltNotImplementedError({ className: 'CliConfig', methodName: 'cwd' });
  }

  /** @throws {ZeltNotImplementedError} */
  argv(): readonly string[] {
    throw new ZeltNotImplementedError({ className: 'CliConfig', methodName: 'argv' });
  }

  /** @throws {ZeltNotImplementedError} */
  exit(_code: number): never {
    throw new ZeltNotImplementedError({ className: 'CliConfig', methodName: 'exit' });
  }

  /** @throws {ZeltNotImplementedError} */
  setExitCode(_code: number): void {
    throw new ZeltNotImplementedError({ className: 'CliConfig', methodName: 'setExitCode' });
  }

  /** @throws {ZeltNotImplementedError} */
  onSignal(_signal: Signal, _handler: SignalHandler): void {
    throw new ZeltNotImplementedError({ className: 'CliConfig', methodName: 'onSignal' });
  }

  /** @throws {ZeltNotImplementedError} */
  offSignal(_signal: Signal, _handler: SignalHandler): void {
    throw new ZeltNotImplementedError({ className: 'CliConfig', methodName: 'offSignal' });
  }
}
