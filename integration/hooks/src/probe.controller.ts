import { Controller, Get, inject } from '@zeltjs/core';

import { DisposableSpy, FirstSpy, SecondSpy, WarmupSpy } from './lifecycle-spy';

// Sole purpose: ensure the spy services get resolved when the app warms up controllers.
@Controller('/probe')
export class ProbeController {
  constructor(
    private readonly first = inject(FirstSpy),
    private readonly second = inject(SecondSpy),
    private readonly disposable = inject(DisposableSpy),
    private readonly warmup = inject(WarmupSpy),
  ) {}

  @Get('/')
  status() {
    return {
      first: this.first.startupCalls,
      second: this.second.startupCalls,
      disposable: this.disposable.shutdownCalls,
      warmup: this.warmup.warmupCalls,
    };
  }
}
