import { Controller, Get, inject } from '@zeltjs/core';

import { DependencyA, NoHookService } from './dependency-spy';

// Forces resolution of DependencyA (which transitively resolves DependencyB) plus NoHookService.
@Controller('/probe-deps')
export class DependencyProbeController {
  constructor(
    private readonly a = inject(DependencyA),
    private readonly noHook = inject(NoHookService),
  ) {}

  @Get('/')
  status() {
    return { a: this.a.b ? 'wired' : 'unwired', noHook: this.noHook.ping() };
  }
}
