import { Injectable } from '@zeltjs/core';

@Injectable()
export class HelloService {
  greeting() {
    return 'Hello, World!';
  }

  greet(name: string) {
    return `Hello, ${name}!`;
  }
}
