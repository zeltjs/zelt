import { Config } from '../../config';

export type Signal = 'SIGINT' | 'SIGTERM';
export type SignalHandler = () => void;

@Config
export class CliConfig {
  cwd(): string {
    throw new Error('CliConfig.cwd() not implemented');
  }

  argv(): readonly string[] {
    throw new Error('CliConfig.argv() not implemented');
  }

  exit(_code: number): never {
    throw new Error('CliConfig.exit() not implemented');
  }

  setExitCode(_code: number): void {
    throw new Error('CliConfig.setExitCode() not implemented');
  }

  onSignal(_signal: Signal, _handler: SignalHandler): void {
    throw new Error('CliConfig.onSignal() not implemented');
  }

  offSignal(_signal: Signal, _handler: SignalHandler): void {
    throw new Error('CliConfig.offSignal() not implemented');
  }
}
