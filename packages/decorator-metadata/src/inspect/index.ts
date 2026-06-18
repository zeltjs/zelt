export { getClassMetadata } from '../runtime/index';
export { getDependencies } from './get-dependencies.lib';
export { getTypeMetadata } from './get-type-metadata.lib';
export type {
  ClassMetadata,
  DependencyInfo,
  ExpandStrategy,
  GetDependenciesOptions,
  InspectError,
  InspectErrorCode,
  InspectOptions,
  MethodInfo,
  ParamInfo,
  PropertyInfo,
  TypedPropertyInfo,
  TypeInfo,
} from './inspect.types';
export type { Position, ResolvePositionOptions } from './position.lib';
export { resolvePosition } from './position.lib';
export type { ProgramCacheError } from './program-cache.lib';
export { clearProgramCache, getOrCreateProgram } from './program-cache.lib';
export type { GetSourcePositionOptions } from './source-position.lib';
export { getSourcePosition } from './source-position.lib';
