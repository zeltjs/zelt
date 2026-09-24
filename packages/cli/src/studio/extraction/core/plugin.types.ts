import type { Node, Program, SourceFile, TypeChecker } from 'typescript';

import type { Feature } from './extract-config.lib';

export type Id = string;
export type ProviderId = string;

export type Span = {
  readonly filePath: string;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
};

export type Evidence = {
  readonly provider: ProviderId;
  readonly span: Span;
  readonly basis: 'syntax' | 'metadata' | 'configured';
};

export type Diagnostic = {
  readonly code: string;
  readonly message: string;
  readonly subject: Id | null;
  readonly spans: readonly Span[];
};

export type IndexedCall = {
  readonly id: Id;
  readonly span: Span;
  readonly owner: Id | null;
  readonly target: Id | null;
  readonly receiver: Span | null;
};

export type ExportReference = { readonly filePath: string; readonly exportName: string };

export type SourceIndex = {
  readonly revision: string;
  readonly program: Program;
  readonly checker: TypeChecker;
  readonly files: readonly SourceFile[];
  readonly declarations: readonly Id[];
  readonly calls: readonly IndexedCall[];
  readonly declaration: (id: Id) => Node | undefined;
  readonly declarationId: (node: Node) => Id | null;
  readonly call: (id: Id) => IndexedCall | undefined;
  readonly node: (span: Span) => Node | null;
  readonly span: (node: Node) => Span;
  readonly directCalls: (owner: Id) => readonly IndexedCall[];
  readonly resolveExport: (ref: ExportReference) => Id | null;
};

export type DiClass = 'service' | 'config';

export type AnalysisScope = {
  readonly files: readonly string[];
  readonly category: 'source' | 'unit' | 'e2e' | 'unclassified';
};

export type AnalysisReport = {
  readonly id: Id;
  readonly provider: ProviderId;
  readonly feature: Feature;
  readonly status: 'disabled' | 'uncollected' | 'complete-in-scope' | 'partial';
  readonly scope: AnalysisScope;
  readonly inspectedFiles: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
};

/** 値の出どころ。`path` は factory の戻り値からの静的な経路(付録F・G) */
export type ValueOrigin =
  | { kind: 'factory-result'; readonly factoryCall: Id; readonly path: readonly string[] }
  | { kind: 'unresolved'; readonly reason: string };

/** 地図に載らない class も指すので、ID ではなく定義位置で表す */
export type ClassRef = { readonly filePath: string; readonly name: string };

export type TestCall = {
  readonly subject: Id;
  readonly invocation: Span;
  /** null: receiver の無い呼出(モジュール関数)。setup は付かない(付録F) */
  readonly origin: ValueOrigin | null;
  readonly ownerClass: ClassRef | null;
};

export type TestContribution = {
  readonly registration: Id;
  readonly caseKey: string;
  readonly category: AnalysisScope['category'];
  readonly name: string;
  readonly suite: readonly string[];
  /** 登録の所在。v1 の TestIdentity.location */
  readonly location: Span;
  readonly body: Span | null;
  readonly mode: 'normal' | 'skip' | 'only' | 'todo';
  readonly calls: readonly TestCall[];
};

export type SetupDetail = {
  readonly dependencies: readonly { readonly provide: ClassRef; readonly kind: DiClass }[];
  readonly configs: readonly ClassRef[];
  readonly overrides: readonly { readonly provide: ClassRef }[];
};

export type SetupAnalysis =
  | { kind: 'uncollected' }
  | { kind: 'unresolved'; readonly reason: 'dynamic-setup' | 'unresolved-provider' }
  | { kind: 'zelt'; readonly detail: SetupDetail };

export type TestSetupContribution = {
  readonly factoryCall: Id;
  readonly resultPath: readonly string[];
  readonly targetClass: ClassRef;
  readonly location: Span;
  readonly analysis: SetupAnalysis;
};

export type ApplicationContribution = {
  readonly factoryCall: Id;
  readonly resultPath: readonly string[];
  readonly applicationId: Id;
};

export type RequestContribution = {
  readonly invocation: Span;
  readonly application: ValueOrigin;
  readonly method: string;
  /** テンプレートの置換部分は `${}` 1 segment として残す(付録G) */
  readonly path: string;
  readonly via: 'direct' | 'helper';
};

export type Material =
  | {
      kind: 'meaning';
      readonly subject: Id;
      readonly meaning: string;
      readonly evidence: readonly Evidence[];
    }
  | {
      kind: 'relation';
      readonly from: Id;
      readonly to: Id;
      readonly relation: string;
      readonly applicationId: Id | null;
      /** 実行時に通る順(0 始まり)。順序を持たない関係は null(付録A) */
      readonly order: number | null;
      readonly evidence: readonly Evidence[];
    }
  | {
      kind: 'hint';
      readonly subject: Id;
      readonly label: string;
      readonly evidence: readonly Evidence[];
    }
  | {
      kind: 'setup';
      readonly subject: Id;
      readonly setup: string;
      readonly label: string;
      readonly target: Id | null;
      readonly evidence: readonly Evidence[];
    }
  | {
      kind: 'route';
      readonly subject: Id;
      readonly registrationKey: string;
      readonly applicationId: Id;
      readonly method: string;
      readonly path: string;
      readonly evidence: readonly Evidence[];
    }
  | {
      kind: 'di';
      readonly subject: Id;
      readonly value: DiClass;
      readonly evidence: readonly Evidence[];
    }
  | { kind: 'test'; readonly value: TestContribution }
  | { kind: 'test-setup'; readonly value: TestSetupContribution }
  | { kind: 'application'; readonly value: ApplicationContribution }
  | { kind: 'request'; readonly value: RequestContribution };

export type PluginInput = {
  readonly source: SourceIndex;
  readonly scopes: readonly AnalysisScope[];
};

/** An export a plugin considers common knowledge for its library; never published. */
export type IgnoreRecommendation = {
  readonly package: string;
  readonly exports: readonly string[];
};

export type PluginResult = {
  readonly revision: string;
  readonly materials: readonly Material[];
  readonly reports: readonly AnalysisReport[];
  readonly ignoreRecommendations: readonly IgnoreRecommendation[];
};

export type ExtractionPlugin = {
  readonly id: ProviderId;
  readonly features: readonly Feature[];
  readonly analyze: (input: PluginInput) => Promise<PluginResult>;
};
