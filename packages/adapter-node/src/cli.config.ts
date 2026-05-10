import { CliConfig, Config, type Signal, type SignalHandler } from '@zeltjs/core';

@Config
export class NodeCliConfig extends CliConfig {
  override cwd(): string {
    return process.cwd();
  }

  override argv(): readonly string[] {
    return process.argv;
  }

  override exit(code: number): never {
    process.exit(code);
  }

  override onSignal(signal: Signal, handler: SignalHandler): void {
    process.on(signal, handler);
  }

  override offSignal(signal: Signal, handler: SignalHandler): void {
    process.off(signal, handler);
  }
}
