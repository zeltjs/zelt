import { Controller, createApp, Get, http, Injectable, inject } from '@zeltjs/core';

@Injectable()
class GreetingService {
  greet(): string {
    return 'Hello from ZeltJS!';
  }
}

@Controller('/')
class GreetingController {
  constructor(private readonly greetings = inject(GreetingService)) {}

  @Get('/')
  hello() {
    return {
      message: this.greetings.greet(),
      next: 'Edit src/app.ts and see what happens.',
    };
  }
}

export const app = createApp([http({ controllers: [GreetingController] })]);
