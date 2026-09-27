// レビュー指摘10: 引数としてインラインで渡される無名コールバック(どの const/let にも
// 束縛されない arrow function / function expression)は FunctionDeclarationInfo として
// 列挙されないことを確認する専用フィクスチャ(collectFunctionDeclarations は
// sourceFile.statements 直下とクラスメンバーしか見ないため、構造的に対象外になるはずの
// リグレッションガード)
export function runWithCallbacks(values: readonly number[]): void {
  values.forEach((n) => {
    doSomething(n);
  });
  setTimeout(function anonymousNamedExpression() {
    doSomething(0);
  }, 0);
}

const doSomething = (n: number): void => {
  void n;
};
