import type ts from 'typescript';

import type { CoreResolver, Diagnostic, Feature, ResolvedConfig, TestScopeConfig } from '../core';

export type ZeltApplicationConfig = {
  readonly id: string;
  readonly factory: { readonly filePath: string; readonly exportName: string };
};

export type ZeltInput = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly applications: readonly ZeltApplicationConfig[];
  /** runner が決めた test の範囲。Zelt は登録の形を知らず、範囲だけを受け取る(付録C) */
  readonly testScopes: readonly TestScopeConfig[];
  /** config の setupDetails。false なら factory と target の対応だけを返す(付録H) */
  readonly setupDetails: boolean;
  readonly revision: string;
};

export type Registration = {
  /** コードに書かれた decorator。setup の label と根拠はこちら */
  readonly decorator: ts.Decorator;
  /** 付与された線の根拠になる式(decorator 本体、または factory 内の UseMiddleware 呼出) */
  readonly evidence: ts.Node;
  /** middleware class を指す式。関数 middleware や Authorized は null */
  readonly middleware: ts.Expression | null;
};

/** 1本の middleware 適用。根拠は登録を書いた場所 */
export type ChainEntry = { readonly expression: ts.Expression; readonly evidence: ts.Node };

export type RouteFact = {
  readonly subject: string;
  readonly controller: ts.ClassDeclaration;
  readonly member: ts.MethodDeclaration;
  readonly method: string;
  readonly path: string;
  readonly decorator: ts.Decorator;
};

export type BusCall = {
  readonly kind: 'subscribe' | 'emit';
  readonly call: ts.CallExpression;
  readonly bus: ts.ClassDeclaration | null;
  readonly event: string | null;
};

/** 1回の解析で共有する索引と収集先。plugin の関数はこれを明示的に受け取る */
export type ZeltContext = {
  readonly input: ZeltInput;
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly appFiles: readonly ts.SourceFile[];
  readonly appClasses: readonly ts.ClassDeclaration[];
  readonly coreDir: string | null;
  readonly eventBusDir: string | null;
  /** package の export declaration から anchor 名を引く表 */
  readonly anchors: ReadonlyMap<ts.Declaration, string>;
  readonly execIds: Map<ts.ClassDeclaration, string>;
  readonly diagnostics: Map<Feature, Diagnostic[]>;
};
