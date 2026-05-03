import { Controller, createHttpApp, Get, inject, Injectable, pathParam } from '@koya/core';

// Service / Repository / Adapter (= Provider) は @Injectable で DI 登録する (spec §4.7)。
@Injectable()
class Greeter {
  greet(name: string) {
    return `hello, ${name}`;
  }
}

@Controller('/hello')
class HelloController {
  // constructor injection。@Controller が @Injectable を兼ねるので、
  // controllers にだけ列挙すれば、依存する Provider は auto-bind で解決される (spec §4.10)。
  constructor(private greeter = inject(Greeter)) {}

  @Get('/:name')
  greet() {
    return { message: this.greeter.greet(pathParam('name')) };
  }
}

const worker = createHttpApp({ controllers: [HelloController] }).toWorker();

const res = await worker.fetch(new Request('https://example.local/hello/koya'));
console.log(res.status, await res.json());
