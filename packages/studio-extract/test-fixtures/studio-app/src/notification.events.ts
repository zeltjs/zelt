declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'greeting:sent': { message: string };
  }
}

export {};
