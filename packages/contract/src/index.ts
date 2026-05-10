export type { SchemaAdapter, JsonSchema } from './types/schema-adapter';
export type { Route } from './types/route';
export type { BuildAppType } from './types/build-app-type';
export type {
  ExtractPathParams,
  ExtractRequestBody,
  ExtractResponse,
  ExtractValidationErrors,
} from './types/extract';
export type { ValidatedMarker, UnwrapValidated } from './types/validated-marker';

export { defineConfig } from './config/options';
export type { GenerateClientOptions } from './config/options';

export { generateClient } from './generate-client';
export type { GenerateClientResult } from './generate-client';
export { watchClient } from './watch';

export type {
  AnalyzerError,
  EmitError,
  ConfigError,
  ContractError,
} from './errors';
