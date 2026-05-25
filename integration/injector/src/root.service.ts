import { Injectable, inject } from '@zeltjs/core';

import { LeafService } from './leaf.service';
import { MiddleService } from './middle.service';

@Injectable()
export class RootService {
  constructor(
    public readonly middle = inject(MiddleService),
    public readonly leaf = inject(LeafService),
  ) {}

  compose(): string {
    return `root(${this.middle.compose()},${this.leaf.value()})`;
  }
}
