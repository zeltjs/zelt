import { Injectable } from '@zeltjs/core';

@Injectable()
export class LeafService {
  value(): string {
    return 'leaf';
  }
}
