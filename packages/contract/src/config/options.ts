type ControllerClass = new (...args: never[]) => object;

export type ControllerEntry =
  | ControllerClass
  | { readonly class: ControllerClass; readonly source: string };

export type GenerateClientOptions = {
  readonly controllers: readonly ControllerEntry[];
  readonly dist: string;
  readonly watch?: boolean;
  // tsconfig パス。OpenAPI 出力時 ts-json-schema-generator が必要。
  readonly tsconfig?: string;
};

// identity 関数。defineConfig 経由で書くと TS が `controllers` の literal narrow を維持しやすい。
export const defineConfig = <T extends GenerateClientOptions>(config: T): T => config;
