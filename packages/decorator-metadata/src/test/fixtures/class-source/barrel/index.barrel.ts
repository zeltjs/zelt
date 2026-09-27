// 宣言を1つも持たず re-export だけをするファイル

export { default as AnonymousDefaultService } from './anonymous-default.service';
export { PlainService } from './plain.service';
export { PublicRenamedService as AliasedService } from './renamed.service';
export * from './star.service';
