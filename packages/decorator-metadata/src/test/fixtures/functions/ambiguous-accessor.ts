// レビュー指摘5: get x() / set x(v) が同名で共存するクラス。this.x の読み取りは
// プロパティアクセスであり呼び出しではないため、owner+name(kind: 'method')だけを
// 手がかりにする getFunctionSignature/getCallSites では一意に決まらないことを確認する
export class AmbiguousAccessor {
  private value = '';

  get x(): string {
    return this.value;
  }

  set x(v: string) {
    this.value = v;
  }

  read(): string {
    return this.x;
  }
}
