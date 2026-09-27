// 宣言を1つも持たず re-export だけをするファイル(log-peak の
// packages/*/src/index.barrel.ts と同じ形)
export { PlainService } from './plain.service';
export { PublicRenamedService as AliasedService } from './renamed.service';
export * from './star.service';
