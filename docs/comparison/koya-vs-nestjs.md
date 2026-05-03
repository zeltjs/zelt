# koya vs NestJS 比較

koya と NestJS のアーキテクチャ・API 設計上の主な違いをまとめる。

---

## 比較表

| トピック | koya | NestJS |
|---|---|---|
| HTTP ランタイム | Hono (内部実装、利用者非露出) | Express / Fastify (利用者が直接扱う場合あり) |
| DI コンテナ | @needle-di/core (auto-bind、explicit 登録なし) | NestJS 組み込み IoC コンテナ (Module + Provider 明示登録) |
| Provider DSL | なし (adapter class が外部境界を内包) | `useFactory` / `useValue` / `useClass` / scope 制御あり |
| Entry 登録 | `createHttpApp({ controllers })` に明示列挙 | `@Module({ controllers, providers })` で宣言 |
| バリデーション | `validated(schema)` を method 引数 default で宣言 (Valibot) | `@Body() body: DTO` + class-validator デコレーター |
| パスパラメータ | `pathParam('id')` を method 引数 default で宣言 | `@Param('id') id: string` デコレーター |
| hono Context 露出 | server 側非露出 / response 制御は `response()` primitive 経由 / client 側 hc は直接利用 | 該当なし |
| RPC / 型安全 client | hono の `hc<AppType>` を直接利用 (build step で AppType 生成) | 組み込みなし (OpenAPI 経由や別ライブラリ利用) |
| OpenAPI 生成 | `@koya/contract` が build step で AppType と OpenAPI 3.1 を同時生成 (zero-annotation, Scramble 流) | `@nestjs/swagger` でデコレーター追加が必要 |
| Error 系 export | `@koya/core` から `HTTPException` を re-export (hono 直接 import 不要) | `HttpException` / `HttpStatus` を `@nestjs/common` から import |
| reflect-metadata | 不要 (@needle-di/core が非依存設計) | 必須 |
| decorator 方式 | legacy decorator (`experimentalDecorators: true`) | legacy decorator + reflect-metadata |
| Module 抽象 | なし (Application + Entry の 2 階建て) | Module が基本単位 |
| bundle 分割 | Entry 別 bundle が原理的に成立 | monolithic 前提 |
