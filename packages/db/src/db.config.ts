import { Config } from '@zeltjs/core';

export type TransactionMode = 'auto' | 'require';

@Config
export class DbConfig {
  get transactionMode(): TransactionMode {
    return 'auto';
  }
}
