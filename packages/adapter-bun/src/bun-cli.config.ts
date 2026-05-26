import type { Signal, SignalHandler } from '@zeltjs/core';
import { CliConfig, Config } from '@zeltjs/core';

@Config
export class BunCliConfig extends CliConfig {
  override cwd(): string {
    return process.cwd();
  }

  override argv(): readonly string[] {
    return Bun.argv;
  }

  override exit(code: number): never {
    process.exit(code);
  }

  override setExitCode(code: number): void {
    process.exitCode = code;
  }

  override onSignal(signal: Signal, handler: SignalHandler): void {
    process.on(signal, handler);
  }

  override offSignal(signal: Signal, handler: SignalHandler): void {
    process.off(signal, handler);
  }
}
