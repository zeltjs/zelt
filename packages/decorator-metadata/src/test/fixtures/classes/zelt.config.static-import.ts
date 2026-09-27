// getConfigAppFactoryRef のテスト(レビュー指摘3-b): `app: () => createApp()` のような
// 静的 import 経由の bare call。旧実装は checker.getSymbolAtLocation の結果(import alias
// シンボル)の getDeclarations()[0] が ImportSpecifier ノードになり解決できなかった。
// checker.getResolvedSignature を優先することで、import を越えて実体の宣言まで解決できることを確認する
import { createApp } from './app-factory';

const defineConfig = <T>(config: T): T => config;

export default defineConfig({
  app: () => createApp(),
});
