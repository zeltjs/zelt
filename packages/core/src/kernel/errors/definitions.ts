import { match } from 'ts-pattern';

export const coreErrorDefinitions = {
  ZeltDecoratorUsageError: (ctx: {
    decoratorName: string;
    reason: 'static_method' | 'missing_decorator' | 'duplicate';
    targetName?: string;
  }) => {
    if (ctx.reason === 'static_method')
      return `@${ctx.decoratorName} cannot be applied to static methods`;
    if (ctx.reason === 'duplicate')
      return `@${ctx.decoratorName} cannot be applied more than once to the same class`;
    return `${ctx.targetName ?? 'class'} is missing @${ctx.decoratorName} decorator`;
  },

  ZeltLifecycleStateError: (ctx: {
    operation: string;
    currentState: 'disposed' | 'ready' | 'starting' | 'not_ready';
  }) => {
    if (ctx.currentState === 'disposed') return `Cannot ${ctx.operation}() after shutdown()`;
    if (ctx.currentState === 'not_ready') return `Cannot ${ctx.operation}() before ready()`;
    if (ctx.currentState === 'starting')
      return `Cannot ${ctx.operation}() while startup is in progress`;
    return `Cannot ${ctx.operation}() after ready()`;
  },

  ZeltContextNotAvailableError: (ctx: {
    primitive: string;
    requiredContext: 'entry' | 'command';
  }) => `${ctx.primitive}() called outside ${ctx.requiredContext} execution`,

  ZeltAppConfigurationError: (ctx: { reason: 'duplicate_command'; details: string }) =>
    `Duplicate command name: ${ctx.details}`,

  ZeltRouteConfigurationError: (ctx: {
    reason: 'missing_path_param' | 'invalid_route';
    paramName?: string;
  }) =>
    ctx.reason === 'missing_path_param'
      ? `path parameter "${ctx.paramName}" is not defined`
      : 'Invalid route configuration',

  ZeltMiddlewareExecutionError: (ctx: {
    reason: 'next_called_multiple_times';
    middlewareName: string;
  }) => `next() called multiple times in middleware '${ctx.middlewareName}'`,

  ZeltNotImplementedError: (ctx: { className: string; methodName: string }) =>
    `${ctx.className}.${ctx.methodName}() not implemented`,

  ZeltSchemaValidationError: (ctx: { schemaType: string; reason: string }) =>
    `Invalid ${ctx.schemaType} schema: ${ctx.reason}`,

  ZeltPluginConfigurationError: (
    ctx:
      | { pluginName: string; reason: 'missing_entry' }
      | { pluginName: string; reason: 'app_not_found' | 'invalid_app'; details: string },
  ) => {
    if (ctx.reason === 'missing_entry') return `[${ctx.pluginName}] entry is required`;
    if (ctx.reason === 'app_not_found')
      return `[${ctx.pluginName}] Could not find app with getMetadata() in ${ctx.details}`;
    return `[${ctx.pluginName}] Invalid app configuration: ${ctx.details}`;
  },

  ZeltCommandArgumentError: (ctx: { commandName: string; argument: string; reason: string }) =>
    `[${ctx.commandName}] ${ctx.argument}: ${ctx.reason}`,

  ZeltCommandExecutionError: (ctx: {
    reason: 'command_not_found' | 'no_command_specified' | 'argv_parse_error' | 'run_error';
    commandName?: string;
    details?: string;
  }): string =>
    match(ctx.reason)
      .with('command_not_found', () => `Command not found: ${ctx.commandName ?? '<unknown>'}`)
      .with('no_command_specified', () => 'No command specified')
      .with('argv_parse_error', () => `Failed to parse arguments: ${ctx.details ?? ''}`)
      .with('run_error', () => `Command execution failed: ${ctx.details ?? ''}`)
      .exhaustive(),

  ZeltEnvError: (ctx: { key: string; reason: 'required_not_set' | 'invalid_number' }) =>
    ctx.reason === 'required_not_set'
      ? `Required environment variable ${ctx.key} is not set`
      : `Environment variable ${ctx.key} is not a valid number`,
} as const;

export type CoreErrorContextMap = {
  [K in keyof typeof coreErrorDefinitions]: Parameters<(typeof coreErrorDefinitions)[K]>[0];
};
