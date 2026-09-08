declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'order:created': {
      orderId: number;
      userId: number;
      items: ReadonlyArray<{ productId: number; quantity: number }>;
    };
  }
}

export {};
