import { createApp, http } from '@zeltjs/core';

import { AuditMiddleware } from './audit.middleware';
import { GreetingConfig } from './greeting.config';
import { GreetingController } from './greeting.controller';
import { NotificationHandler } from './notification.handler';

// レビュー指摘10: NotificationHandler は `eventbus({ handlers: [...] })` 経由ではなく
// configs に直接登録する。eventbus() の featureClasses() は opts.adaptor
// (MemoryEventBusAdaptor、@zeltjs/eventbus パッケージ内の外部クラス)も root にする設計だが、
// root は getClassSource の実行時反射で解決される。pnpm workspace の生 symlink(実体パスが
// /node_modules/ を経由しない)だとこの反射結果が packageFromPath の node_modules
// ヒューリスティックに一致しなくなるため、package.json の dependenciesMeta.injected で
// @zeltjs/eventbus を実体コピーにして回避した(ec-backend 側は file: 経由の .pnpm store
// 実体化で元々 /node_modules/ を経由するため未発生)。root にする必要があるのは
// NotificationHandler 自身(fixture 内蔵クラス)だけで、MemoryEventBusAdaptor への
// inject() 解決は静的解析の別経路のため影響を受けない。eventbus() を経由しない方が
// 余分な root を増やさずに済むためこちらを選んだ
export const app = createApp(
  [http({ controllers: [GreetingController], middlewares: [AuditMiddleware] })],
  { configs: [GreetingConfig, NotificationHandler] },
);

// 抽出 config は app の入口として「引数なしの factory」を指す(付録D)
export const createFixtureApp = () => app;
