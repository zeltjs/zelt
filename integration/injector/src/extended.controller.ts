import { Controller, Get, inject } from '@zeltjs/core';

import { ExtendedService } from './base.service';

@Controller('/extended')
export class ExtendedController {
  constructor(private service = inject(ExtendedService)) {}

  @Get('/')
  index() {
    return { kind: this.service.kind(), bonus: this.service.bonus() };
  }
}
