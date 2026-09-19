// getConfigAppFactoryRef は呼び出し名を問わず `app` プロパティの構造だけを見るため、
// 実際の `@zeltjs/cli` の defineConfig を import しない(decorator-metadata から
// @zeltjs/cli への循環 workspace 依存を避けるため。integration/ec-backend/zelt.config.ts
// と挙動は同じ形)
const defineConfig = <T>(config: T): T => config;

export default defineConfig({
  app: () => import('./app-factory').then((m) => m.createApp()),
});
