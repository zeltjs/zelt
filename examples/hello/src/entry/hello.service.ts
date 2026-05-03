// Service / Repository / Adapter (= Provider) は @Injectable で DI 登録する (spec §4.7)。
import { Injectable } from '@koya/core';

@Injectable()
export class HelloService {
  greet(name: string) {
    return `hello, ${name}`;
  }
}
