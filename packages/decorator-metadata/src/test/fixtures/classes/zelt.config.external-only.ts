// getConfigAppFactoryRef のテスト(レビュー指摘3-c): app プロパティの中の呼び出しが
// TypeScript 既定lib(parseInt)のみの場合、internal な候補が1つも見つからず undefined を
// 返すことを確認する(default-lib の宣言を internal と誤判定して root にしてはならない)
const defineConfig = <T>(config: T): T => config;

export default defineConfig({
  app: () => parseInt('1', 10),
});
