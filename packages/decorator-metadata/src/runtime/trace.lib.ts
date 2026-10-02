export class CaptureStackError extends Error {
  override readonly name = 'CaptureStackError';
  constructor() {
    super('Capture stack trace');
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type StackTrace = {
  _brand: 'StackTrace';
  readonly error: CaptureStackError;
  readonly callError?: CaptureStackError;
};

// `new CaptureStackError()` の `.stack` に載るフレーム数は V8 の `Error.stackTraceLimit`
// (既定 10)に切り詰められる。studio の getDecoratorApplicationPosition
// (get-decorator-application-position.lib.ts)は、ここで得た define trace を辿って
// decorator ファクトリの呼び出し元(ユーザーがソース上に書いた行)まで遡るため、
// このフレーム上限が実質的な「何段までのラップに耐えられるか」の制約になる
// (1段ラップの `@RateLimit` 程度なら数フレームで収まり問題ないが、ラップが深くなるほど
// フレーム数が増え、上限を超えると解決に失敗しうる)。上限自体は変更しない
// (`Error.stackTraceLimit` を書き換えるのは studio 固有の都合であり、この関数はデコレータ
// メタデータ全体の共有基盤のため、他の利用箇所への副作用を避ける)
export const captureStackTrace = (): StackTrace | undefined => {
  const error = new CaptureStackError();
  // Preserve registration frames now; inspect formats and validates the stack on demand.
  return { _brand: 'StackTrace', error };
};

export const withCallStackTrace = (
  defineTrace: StackTrace | undefined,
  callTrace: StackTrace | undefined,
): StackTrace | undefined => {
  if (!defineTrace) return undefined;
  if (!callTrace) return defineTrace;
  return { ...defineTrace, callError: callTrace.error };
};
