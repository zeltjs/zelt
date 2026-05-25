import type { Signal, SignalHandler } from '@zeltjs/core';
import { CliConfig, Config } from '@zeltjs/core';

// Captures signal handlers in-memory so specs can invoke them without touching real process signals.
@Config
export class TestCliConfig extends CliConfig {
  private readonly handlers = new Map<Signal, Set<SignalHandler>>();

  override onSignal(signal: Signal, handler: SignalHandler): void {
    let set = this.handlers.get(signal);
    if (!set) {
      set = new Set();
      this.handlers.set(signal, set);
    }
    set.add(handler);
  }

  override offSignal(signal: Signal, handler: SignalHandler): void {
    this.handlers.get(signal)?.delete(handler);
  }

  emit(signal: Signal): void {
    const set = this.handlers.get(signal);
    if (!set) return;
    for (const handler of set) handler();
  }

  handlerCount(signal: Signal): number {
    return this.handlers.get(signal)?.size ?? 0;
  }
}
