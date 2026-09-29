import type ts from 'typescript';

import type {
  CoreResolver,
  Diagnostic,
  ExportReference,
  Feature,
  ResolvedConfig,
  TestScopeConfig,
} from '../core';

export type ZeltApplicationConfig = {
  readonly id: string;
  /** createApp() の戻り値を export している場所 */
  readonly app: ExportReference;
};

export type ZeltInput = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly applications: readonly ZeltApplicationConfig[];
  /** app を読み込む子プロセスの entry。build 後は dist の .js を渡す(付録D) */
  readonly entryPath: string;
  /** config の timeoutMs。子プロセスがこれを超えたら生成失敗 */
  readonly timeoutMs: number;
  /** runner が決めた test の範囲。Zelt は登録の形を知らず、範囲だけを受け取る(付録C) */
  readonly testScopes: readonly TestScopeConfig[];
  /** config の setupDetails。false なら factory と target の対応だけを返す(付録H) */
  readonly setupDetails: boolean;
  readonly revision: string;
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
  readonly eventBusDir: string | null;
  /** package の export declaration から anchor 名を引く表 */
  readonly anchors: ReadonlyMap<ts.Declaration, string>;
  readonly diagnostics: Map<Feature, Diagnostic[]>;
};
