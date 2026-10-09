import { match } from 'ts-pattern';

export const formatZeltDecoratorUsageError = (ctx: {
  decoratorName: string;
  reason: 'static_method' | 'missing_decorator' | 'duplicate';
  targetName?: string;
}) => {
  if (ctx.reason === 'static_method')
    return `@${ctx.decoratorName} cannot be applied to static methods`;
  if (ctx.reason === 'duplicate')
    return `@${ctx.decoratorName} cannot be applied more than once to the same class`;
  return `${ctx.targetName ?? 'class'} is missing @${ctx.decoratorName} decorator`;
};

export const formatZeltLifecycleStateError = (ctx: {
  operation: string;
  currentState: 'disposed' | 'ready' | 'starting' | 'not_ready' | 'pending';
}) => {
  if (ctx.currentState === 'disposed') return `Cannot ${ctx.operation}() after shutdown()`;
  if (ctx.currentState === 'not_ready') return `Cannot ${ctx.operation}() before createRuntime()`;
  if (ctx.currentState === 'starting')
    return `Cannot ${ctx.operation}() while startup is in progress`;
  if (ctx.currentState === 'pending') return `Cannot ${ctx.operation}() before startup()`;
  return `Cannot ${ctx.operation}() after createRuntime()`;
};

export const formatZeltReadyFailedError = (ctx: { lifecycleName: string }) =>
  `Lifecycle startup failed: ${ctx.lifecycleName}`;

export const formatZeltContextNotAvailableError = (ctx: {
  primitive: string;
  requiredContext: 'entry' | 'command';
}) => `${ctx.primitive}() called outside ${ctx.requiredContext} execution`;

export const formatZeltAppConfigurationError = (
  ctx:
    | { reason: 'duplicate_command'; details: string }
    | { reason: 'invalid_command_schema'; details: string }
    | { reason: 'abstract_leaf_without_concrete'; details: string }
    | { reason: 'duplicate_feature_key'; details: string }
    | { reason: 'reserved_feature_key'; details: string },
) => {
  if (ctx.reason === 'invalid_command_schema') {
    return `Invalid command schema: ${ctx.details}`;
  }
  if (ctx.reason === 'abstract_leaf_without_concrete') {
    return `Abstract config class ${ctx.details} requires a concrete config class`;
  }
  if (ctx.reason === 'reserved_feature_key') {
    return `Reserved feature namespace: ${ctx.details}`;
  }
  if (ctx.reason === 'duplicate_feature_key') {
    return `Duplicate feature namespace: ${ctx.details}`;
  }
  return `Duplicate command name: ${ctx.details}`;
};

export const formatZeltRouteConfigurationError = (ctx: {
  reason: 'missing_path_param' | 'invalid_route';
  paramName?: string;
}) =>
  ctx.reason === 'missing_path_param'
    ? `path parameter "${ctx.paramName}" is not defined`
    : 'Invalid route configuration';

export const formatZeltMiddlewareExecutionError = (ctx: {
  reason: 'next_called_multiple_times';
  middlewareName: string;
}) => `next() called multiple times in middleware '${ctx.middlewareName}'`;

export const formatZeltMiddlewareValueUnavailableError = (ctx: { middlewareName: string }) =>
  `No value available for middleware '${ctx.middlewareName}'. It is not applied to this route, ` +
  `or it has not run yet. Apply it with @UseMiddleware(${ctx.middlewareName}) before calling ` +
  `middlewareValue(${ctx.middlewareName}).`;

export const formatZeltMiddlewareOptionsUnavailableError = (ctx: { middlewareName: string }) =>
  `No options available for middleware '${ctx.middlewareName}'. It is not applied via ` +
  `${ctx.middlewareName}.with(options) on this route, or it has not run yet. Apply it with ` +
  `@UseMiddleware(${ctx.middlewareName}.with(options)) before calling middlewareOptions(${ctx.middlewareName}).`;

export const formatZeltNotImplementedError = (ctx: { className: string; methodName: string }) =>
  `${ctx.className}.${ctx.methodName}() not implemented`;

export const formatZeltSchemaValidationError = (ctx: { schemaType: string; reason: string }) =>
  `Invalid ${ctx.schemaType} schema: ${ctx.reason}`;

export const formatZeltPluginConfigurationError = (
  ctx:
    | { pluginName: string; reason: 'missing_entry' }
    | { pluginName: string; reason: 'app_not_found' | 'invalid_app'; details: string },
) => {
  if (ctx.reason === 'missing_entry') return `[${ctx.pluginName}] entry is required`;
  if (ctx.reason === 'app_not_found')
    return `[${ctx.pluginName}] Could not find app with getMetadata() in ${ctx.details}`;
  return `[${ctx.pluginName}] Invalid app configuration: ${ctx.details}`;
};

export const formatZeltCommandArgumentError = (ctx: {
  commandName: string;
  argument: string;
  reason: string;
}) => `[${ctx.commandName}] ${ctx.argument}: ${ctx.reason}`;

export const formatZeltCommandExecutionError = (ctx: {
  reason: 'command_not_found' | 'no_command_specified' | 'argv_parse_error' | 'run_error';
  commandName?: string;
  details?: string;
}): string =>
  match(ctx.reason)
    .with('command_not_found', () => `Command not found: ${ctx.commandName ?? '<unknown>'}`)
    .with('no_command_specified', () => 'No command specified')
    .with('argv_parse_error', () => `Failed to parse arguments: ${ctx.details ?? ''}`)
    .with('run_error', () => `Command execution failed: ${ctx.details ?? ''}`)
    .exhaustive();

export const formatZeltEnvError = (ctx: {
  key: string;
  reason: 'required_not_set' | 'invalid_number';
}) =>
  ctx.reason === 'required_not_set'
    ? `Required environment variable ${ctx.key} is not set`
    : `Environment variable ${ctx.key} is not a valid number`;

export const formatZeltBodyTypeMismatchError = (ctx: { expected: string; actual: string }) =>
  `Expected body type '${ctx.expected}' but received '${ctx.actual}'`;

export const formatZeltInternalError = (ctx: {
  reason: 'container_not_attached' | 'http_router_init_failed';
}) =>
  match(ctx.reason)
    .with('container_not_attached', () => 'No DI container attached to this app')
    .with('http_router_init_failed', () => 'HttpService createLocalRouter failed')
    .exhaustive();

export const coreErrorDefinitions = {
  ZeltDecoratorUsageError: formatZeltDecoratorUsageError,
  ZeltLifecycleStateError: formatZeltLifecycleStateError,
  ZeltReadyFailedError: formatZeltReadyFailedError,
  ZeltContextNotAvailableError: formatZeltContextNotAvailableError,
  ZeltAppConfigurationError: formatZeltAppConfigurationError,
  ZeltRouteConfigurationError: formatZeltRouteConfigurationError,
  ZeltMiddlewareExecutionError: formatZeltMiddlewareExecutionError,
  ZeltMiddlewareValueUnavailableError: formatZeltMiddlewareValueUnavailableError,
  ZeltMiddlewareOptionsUnavailableError: formatZeltMiddlewareOptionsUnavailableError,
  ZeltNotImplementedError: formatZeltNotImplementedError,
  ZeltSchemaValidationError: formatZeltSchemaValidationError,
  ZeltPluginConfigurationError: formatZeltPluginConfigurationError,
  ZeltCommandArgumentError: formatZeltCommandArgumentError,
  ZeltCommandExecutionError: formatZeltCommandExecutionError,
  ZeltEnvError: formatZeltEnvError,
  ZeltBodyTypeMismatchError: formatZeltBodyTypeMismatchError,
  ZeltInternalError: formatZeltInternalError,
} as const;

export type CoreErrorContextMap = {
  [K in keyof typeof coreErrorDefinitions]: Parameters<(typeof coreErrorDefinitions)[K]>[0];
};
