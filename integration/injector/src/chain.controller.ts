import { Controller, Get, inject } from '@zeltjs/core';

import { RootService } from './root.service';

@Controller('/chain')
export class ChainController {
  constructor(private root = inject(RootService)) {}

  @Get('/')
  index() {
    return { composed: this.root.compose() };
  }
}
