// getFunctionDeclarations テスト用。export 有無で visibility が分かれることを確認する
// (export -> public, 非export -> private。9(a)の設計判断メモを参照)
export function exportedFn(value: string): string {
  return value;
}

const privateFn = (value: number): number => {
  return value * 2;
};

export const exportedArrow = (value: boolean): boolean => {
  return !value;
};

// レビュー指摘8: `export { fn }` の別文再export(宣言自体に export 修飾子は無い)も public
// として扱われることを確認する
const reExportedFn = (value: string): string => value.toUpperCase();

export { reExportedFn };

privateFn(1);
