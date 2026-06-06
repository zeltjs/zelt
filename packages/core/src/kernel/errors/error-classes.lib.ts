import { defineError } from './define-error.lib';
import { coreErrorDefinitions } from './error-definitions.lib';

export const ZeltDecoratorUsageError = defineError(
  'ZeltDecoratorUsageError',
  coreErrorDefinitions.ZeltDecoratorUsageError,
);
export type ZeltDecoratorUsageError = InstanceType<typeof ZeltDecoratorUsageError>;

export const ZeltLifecycleStateError = defineError(
  'ZeltLifecycleStateError',
  coreErrorDefinitions.ZeltLifecycleStateError,
);
export type ZeltLifecycleStateError = InstanceType<typeof ZeltLifecycleStateError>;

export const ZeltReadyFailedError = defineError(
  'ZeltReadyFailedError',
  coreErrorDefinitions.ZeltReadyFailedError,
);
export type ZeltReadyFailedError = InstanceType<typeof ZeltReadyFailedError>;

export const ZeltContextNotAvailableError = defineError(
  'ZeltContextNotAvailableError',
  coreErrorDefinitions.ZeltContextNotAvailableError,
);
export type ZeltContextNotAvailableError = InstanceType<typeof ZeltContextNotAvailableError>;

export const ZeltAppConfigurationError = defineError(
  'ZeltAppConfigurationError',
  coreErrorDefinitions.ZeltAppConfigurationError,
);
export type ZeltAppConfigurationError = InstanceType<typeof ZeltAppConfigurationError>;

export const ZeltRouteConfigurationError = defineError(
  'ZeltRouteConfigurationError',
  coreErrorDefinitions.ZeltRouteConfigurationError,
);
export type ZeltRouteConfigurationError = InstanceType<typeof ZeltRouteConfigurationError>;

export const ZeltMiddlewareExecutionError = defineError(
  'ZeltMiddlewareExecutionError',
  coreErrorDefinitions.ZeltMiddlewareExecutionError,
);
export type ZeltMiddlewareExecutionError = InstanceType<typeof ZeltMiddlewareExecutionError>;

export const ZeltNotImplementedError = defineError(
  'ZeltNotImplementedError',
  coreErrorDefinitions.ZeltNotImplementedError,
);
export type ZeltNotImplementedError = InstanceType<typeof ZeltNotImplementedError>;

export const ZeltSchemaValidationError = defineError(
  'ZeltSchemaValidationError',
  coreErrorDefinitions.ZeltSchemaValidationError,
);
export type ZeltSchemaValidationError = InstanceType<typeof ZeltSchemaValidationError>;

export const ZeltPluginConfigurationError = defineError(
  'ZeltPluginConfigurationError',
  coreErrorDefinitions.ZeltPluginConfigurationError,
);
export type ZeltPluginConfigurationError = InstanceType<typeof ZeltPluginConfigurationError>;

export const ZeltCommandArgumentError = defineError(
  'ZeltCommandArgumentError',
  coreErrorDefinitions.ZeltCommandArgumentError,
);
export type ZeltCommandArgumentError = InstanceType<typeof ZeltCommandArgumentError>;

export const ZeltCommandExecutionError = defineError(
  'ZeltCommandExecutionError',
  coreErrorDefinitions.ZeltCommandExecutionError,
);
export type ZeltCommandExecutionError = InstanceType<typeof ZeltCommandExecutionError>;

export const ZeltEnvError = defineError('ZeltEnvError', coreErrorDefinitions.ZeltEnvError);
export type ZeltEnvError = InstanceType<typeof ZeltEnvError>;

export const ZeltBodyTypeMismatchError = defineError(
  'ZeltBodyTypeMismatchError',
  coreErrorDefinitions.ZeltBodyTypeMismatchError,
);
export type ZeltBodyTypeMismatchError = InstanceType<typeof ZeltBodyTypeMismatchError>;

export const ZeltInternalError = defineError(
  'ZeltInternalError',
  coreErrorDefinitions.ZeltInternalError,
);
export type ZeltInternalError = InstanceType<typeof ZeltInternalError>;
