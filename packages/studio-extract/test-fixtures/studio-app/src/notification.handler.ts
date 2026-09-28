// レビュー指摘10: analyzer.integration.test.ts に @zeltjs/eventbus の emit/subscribe を
// 1組追加し、EventEdge + entry:{kind:'event'} が実際に発見されることをカバーする。
// constructor は FnNode に列挙されない(design memo: getFunctionDeclarations がコンストラクタを
// 除外する)ため、on() 呼び出しは通常のメソッドの中に置く必要がある
import { Injectable, inject } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';

import './notification.events';

@Injectable()
export class NotificationHandler {
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly eventBus = inject(MemoryEventBusAdaptor)) {}

  subscribe(): void {
    this.unsubscribe = this.eventBus.on('greeting:sent', (data) => {
      this.record(data.message);
    });
  }

  unsubscribeAll(): void {
    this.unsubscribe?.();
  }

  record(message: string): void {
    console.log(message);
  }
}
