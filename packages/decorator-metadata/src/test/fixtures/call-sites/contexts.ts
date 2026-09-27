// getCallSites の文脈判定(7種)テスト用
export class ContextExamples {
  async tryContext(): Promise<void> {
    try {
      inner();
    } catch {
      // 呼び出し無し
    }
  }

  // try 側に呼び出し式を置かずに catch へ到達可能にするため、引数の Promise を await する
  async catchContext(pending: Promise<void>): Promise<void> {
    try {
      await pending;
    } catch {
      inner();
    }
  }

  async finallyContext(): Promise<void> {
    try {
      // 呼び出し無し
    } finally {
      inner();
    }
  }

  branchContext(flag: boolean): void {
    if (flag) {
      inner();
    } else {
      inner();
    }
  }

  ternaryBranchContext(flag: boolean): void {
    flag ? inner() : inner();
  }

  loopContext(items: readonly number[]): void {
    for (const _item of items) {
      inner();
    }
  }

  callbackContext(items: readonly number[]): void {
    items.forEach(() => {
      inner();
    });
  }

  plainContext(): void {
    inner();
  }

  // 入れ子: try の中の loop は「呼び出しに最も近い構造が優先される」ため 'loop' になる
  loopWinsInsideTry(items: readonly number[]): void {
    try {
      for (const _item of items) {
        inner();
      }
    } catch {
      // 呼び出し無し
    }
  }
}

function inner(): void {
  // no-op
}

// team-lead 決定(Task 10 remaining-diff cause 1): モジュールスコープの `const f = () => {...}`
// (ArrowFunction)自身のトップレベルの呼び出しは 'plain' になるべき(その関数自身の宣言が
// たまたま ArrowFunction であること自体を「コールバックの中」と誤認してはいけない)。
// classifyCallContext の boundary が collected.node(ArrowFunction 自身)だと、body の
// 親が ArrowFunction で body 自身がその `.body` であるという構造にルール5が誤って
// マッチしていた(ec-backend の requireUser/hashPassword で実例確認済み)
export const moduleScopeArrowPlain = (): void => {
  inner();
};

// 比較用: モジュールスコープの `function foo() {}` 宣言は元々このバグの対象外
// (FunctionDeclaration は ArrowFunction/FunctionExpression ではないため)だが、
// 回帰確認として明示的にテストする
export function moduleScopeFunctionDeclarationPlain(): void {
  inner();
}
