import { createErrorClass } from './factory';

export const ZeltDecoratorUsageError = createErrorClass('ZeltDecoratorUsageError');
export type ZeltDecoratorUsageError = InstanceType<typeof ZeltDecoratorUsageError>;

export const ZeltLifecycleStateError = createErrorClass('ZeltLifecycleStateError');
export type ZeltLifecycleStateError = InstanceType<typeof ZeltLifecycleStateError>;

export const ZeltContextNotAvailableError = createErrorClass('ZeltContextNotAvailableError');
export type ZeltContextNotAvailableError = InstanceType<typeof ZeltContextNotAvailableError>;

export const ZeltAppConfigurationError = createErrorClass('ZeltAppConfigurationError');
export type ZeltAppConfigurationError = InstanceType<typeof ZeltAppConfigurationError>;

export const ZeltRouteConfigurationError = createErrorClass('ZeltRouteConfigurationError');
export type ZeltRouteConfigurationError = InstanceType<typeof ZeltRouteConfigurationError>;

export const ZeltMiddlewareExecutionError = createErrorClass('ZeltMiddlewareExecutionError');
export type ZeltMiddlewareExecutionError = InstanceType<typeof ZeltMiddlewareExecutionError>;

export const ZeltNotImplementedError = createErrorClass('ZeltNotImplementedError');
export type ZeltNotImplementedError = InstanceType<typeof ZeltNotImplementedError>;

export const ZeltSchemaValidationError = createErrorClass('ZeltSchemaValidationError');
export type ZeltSchemaValidationError = InstanceType<typeof ZeltSchemaValidationError>;

export const ZeltPluginConfigurationError = createErrorClass('ZeltPluginConfigurationError');
export type ZeltPluginConfigurationError = InstanceType<typeof ZeltPluginConfigurationError>;

export const ZeltCommandArgumentError = createErrorClass('ZeltCommandArgumentError');
export type ZeltCommandArgumentError = InstanceType<typeof ZeltCommandArgumentError>;
