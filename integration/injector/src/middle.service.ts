import { Injectable, inject } from '@zeltjs/core';

import { LeafService } from './leaf.service';

@Injectable()
export class MiddleService {
  constructor(public readonly leaf = inject(LeafService)) {}

  compose(): string {
    return `middle(${this.leaf.value()})`;
  }
}
