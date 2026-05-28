import { Injectable } from '@zeltjs/core';
import { unsafeTypedJsonParse } from '@zeltjs/unsafe-type-lib';

import type { Defined } from '../kv.types';

@Injectable()
export class KVUtilService {
  joinPrefix(a: string, b: string): string {
    return a + b;
  }

  serialize(value: Defined): string {
    return JSON.stringify(value);
  }

  deserialize<T>(raw: string | null): T | undefined {
    if (raw === null) return undefined;
    return unsafeTypedJsonParse<T>(raw);
  }
}
