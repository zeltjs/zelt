export { getClassMetadata } from '../runtime/index';
export { getClassSource, resolveClassSource } from './class-source.lib';
export { getDependencies, getDependenciesFromSource } from './get-dependencies.lib';
export { getDependencySources } from './get-dependency-sources.lib';
export { getTypeMetadata } from './get-type-metadata.lib';
export type {
  ClassMetadata,
  ClassSource,
  DependencyInfo,
  DependencySource,
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
export { resolveDefinitionPosition, resolvePosition } from './position.lib';
export type { ProgramCacheError } from './program-cache.lib';
export { clearProgramCache, getOrCreateProgram } from './program-cache.lib';
export type { GetSourcePositionOptions } from './source-position.lib';
export { getSourcePosition } from './source-position.lib';
