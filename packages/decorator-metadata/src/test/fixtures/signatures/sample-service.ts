// getPublicMethodSignatures テスト用。装飾子なしのプレーンなクラスで
// public/private/protected/static/accessor/overload/#private を網羅する
export class SampleService {
  greet(name: string): string {
    return `hello ${name}`;
  }

  async fetchCount(): Promise<number> {
    return 0;
  }

  overloaded(value: string): string;
  overloaded(value: number): number;
  overloaded(value: string | number): string | number {
    return value;
  }

  // private/#private は biome の未使用メンバー削除を避けるため protected から参照する
  protected guarded(): void {
    this.hidden();
  }
  static helper(): void {}

  get computed(): number {
    return 1;
  }

  private hidden(): void {
    this.#secret();
  }
  #secret(): void {}
}

export class EmptyService {}

class AliasedService {
  ping(): number {
    return 1;
  }
}

export { AliasedService as RenamedService };
