// この fixture の tsconfig.json の "include" は "src/**/*" のみで、プロジェクトルート
// 直下に置かれたこのファイル自体を含まない(integration/ec-backend/zelt.config.ts と
// 同じ形。getOrCreateProgram の extraRootFiles がこのファイルを Program に含めることを
// 検証するための fixture)
const defineConfig = <T>(config: T): T => config;

export default defineConfig({
  app: () => import('./src/app-factory').then((m) => m.createApp()),
});
