// Analyzer層のエラー
export type AnalyzerError =
  | { type: 'SOURCE_FILE_NOT_FOUND'; path: string }
  | { type: 'CLASS_NOT_FOUND'; className: string; path: string }
  | { type: 'CONTROLLER_DECORATOR_MISSING'; className: string }
  | { type: 'DECORATOR_REQUIRES_STRING_LITERAL'; decoratorName: string }
  | { type: 'MODULE_RESOLVE_FAILED'; exportName: string }
  | { type: 'PATH_PARAM_REQUIRES_LITERAL' };

// Emit層のエラー
export type EmitError =
  | { type: 'MODULE_NOT_OBJECT'; modulePath: string }
  | { type: 'EXPORT_NOT_FOUND'; exportName: string; modulePath: string }
  | { type: 'INLINE_SCHEMA_NOT_SUPPORTED' }
  | { type: 'NOT_VALIBOT_SCHEMA'; exportName: string; modulePath: string }
  | { type: 'UNRESOLVABLE_RESPONSE_TYPE' };

// Config層のエラー
export type ConfigError =
  | { type: 'CONFIG_NOT_FOUND' }
  | { type: 'INVALID_CONFIG_EXPORT'; path: string }
  | { type: 'REQUEST_VALIDATOR_REQUIRED' };

// 統合エラー型
export type ContractError = AnalyzerError | EmitError | ConfigError;
