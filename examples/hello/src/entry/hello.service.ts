// Service / Repository / Adapter (= Provider) は @Injectable で DI 登録する (spec §4.7)。
import { Injectable } from '@zeltjs/core';

@Injectable()
export class HelloService {
  greet(name: string) {
    return `hello, ${name}`;
  }
}
