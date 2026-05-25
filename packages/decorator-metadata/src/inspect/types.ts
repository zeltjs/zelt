import type { Position } from '../runtime/position';

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
  | 'TSCONFIG_ERROR';

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
};
