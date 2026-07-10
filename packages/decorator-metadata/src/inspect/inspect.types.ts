import type { Position } from './position.lib';

export type { Position };

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'undefined';

export type TypeInfo =
  | { kind: 'primitive'; readonly type: PrimitiveType }
  | { kind: 'literal'; readonly value: string | number | boolean }
  | {
      kind: 'named';
      readonly name: string;
      readonly module: string;
      readonly isExported: boolean;
    }
  | { kind: 'array'; readonly items: TypeInfo }
  | { kind: 'object'; readonly properties: readonly TypedPropertyInfo[] }
  | { kind: 'union'; readonly types: readonly TypeInfo[] }
  | { kind: 'promise'; readonly inner: TypeInfo }
  | { kind: 'unknown' }
  | { kind: 'ref'; readonly name: string };

export type TypedPropertyInfo = {
  readonly name: string;
  readonly type: TypeInfo;
  readonly optional: boolean;
};

export type ParamInfo = {
  readonly name: string;
  readonly type: TypeInfo;
  readonly pos: Position | undefined;
};

export type MethodInfo = {
  readonly name: string | symbol;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
  readonly params: readonly ParamInfo[];
  readonly returnType: TypeInfo;
};

export type PropertyInfo = {
  readonly name: string | symbol;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
  readonly type: TypeInfo;
  readonly optional: boolean;
};

export type ClassMetadata = {
  readonly name: string;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
  readonly methods: readonly MethodInfo[];
  readonly properties: readonly PropertyInfo[];
};

export type InspectErrorCode =
  | 'NO_METADATA'
  | 'SOURCE_NOT_FOUND'
  | 'POSITION_INVALID'
  | 'TSCONFIG_ERROR'
  | 'EXPORT_NOT_FOUND'
  | 'MODULE_LOAD_FAILED';

/**
 * 実クラスと静的なソース参照を相互変換するための識別子。
 * filePath はそのまま dynamic import できる解決済みパスであること
 * (= ClassSource は「import 可能」を不変条件とする)。
 */
export type ClassSource = {
  readonly filePath: string;
  readonly exportName: string;
};

/**
 * getDependencySources の 1 依存分の結果。
 * kind: 'class' の source は「実クラス経由で正準化済み」の ClassSource
 * (同一クラスなら root 由来でも依存由来でも必ず同じ値になる)。
 */
export type DependencySource =
  | { kind: 'class'; readonly localName: string; readonly source: ClassSource }
  | { kind: 'unresolved'; readonly localName: string; readonly reason: string };

export type InspectError = {
  readonly code: InspectErrorCode;
  readonly message: string;
};

export type ExpandStrategy = 'exported-only' | 'all-named' | 'always';

export type InspectOptions = {
  readonly tsconfig?: string;
  readonly expandStrategy?: ExpandStrategy;
};

// --- getDependencies types ---

export type GetDependenciesOptions = {
  readonly tsconfig?: string;
};

export type DependencyInfo = {
  readonly className: string;
  readonly sourceFile: string;
  readonly moduleSpecifier: string;
  readonly hasConfigDecorator: boolean;
  readonly decorators: readonly string[];
};
