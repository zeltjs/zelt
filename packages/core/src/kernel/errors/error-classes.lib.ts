import { defineError } from './define-error.lib';
import {
  formatZeltAppConfigurationError,
  formatZeltBodyTypeMismatchError,
  formatZeltCommandArgumentError,
  formatZeltCommandExecutionError,
  formatZeltContextNotAvailableError,
  formatZeltDecoratorUsageError,
  formatZeltEnvError,
  formatZeltInternalError,
  formatZeltLifecycleStateError,
  formatZeltMiddlewareExecutionError,
  formatZeltMiddlewareOptionsUnavailableError,
  formatZeltMiddlewareValueUnavailableError,
  formatZeltNotImplementedError,
  formatZeltPluginConfigurationError,
  formatZeltReadyFailedError,
  formatZeltRouteConfigurationError,
  formatZeltSchemaValidationError,
} from './error-definitions.lib';

export const ZeltDecoratorUsageError = /* @__PURE__ */ defineError(
  'ZeltDecoratorUsageError',
  formatZeltDecoratorUsageError,
);
export type ZeltDecoratorUsageError = InstanceType<typeof ZeltDecoratorUsageError>;

export const ZeltLifecycleStateError = /* @__PURE__ */ defineError(
  'ZeltLifecycleStateError',
  formatZeltLifecycleStateError,
);
export type ZeltLifecycleStateError = InstanceType<typeof ZeltLifecycleStateError>;

export const ZeltReadyFailedError = /* @__PURE__ */ defineError(
  'ZeltReadyFailedError',
  formatZeltReadyFailedError,
);
export type ZeltReadyFailedError = InstanceType<typeof ZeltReadyFailedError>;

export const ZeltContextNotAvailableError = /* @__PURE__ */ defineError(
  'ZeltContextNotAvailableError',
  formatZeltContextNotAvailableError,
);
export type ZeltContextNotAvailableError = InstanceType<typeof ZeltContextNotAvailableError>;

export const ZeltAppConfigurationError = /* @__PURE__ */ defineError(
  'ZeltAppConfigurationError',
  formatZeltAppConfigurationError,
);
export type ZeltAppConfigurationError = InstanceType<typeof ZeltAppConfigurationError>;

export const ZeltRouteConfigurationError = /* @__PURE__ */ defineError(
  'ZeltRouteConfigurationError',
  formatZeltRouteConfigurationError,
);
export type ZeltRouteConfigurationError = InstanceType<typeof ZeltRouteConfigurationError>;

export const ZeltMiddlewareExecutionError = /* @__PURE__ */ defineError(
  'ZeltMiddlewareExecutionError',
  formatZeltMiddlewareExecutionError,
);
export type ZeltMiddlewareExecutionError = InstanceType<typeof ZeltMiddlewareExecutionError>;

export const ZeltMiddlewareValueUnavailableError = /* @__PURE__ */ defineError(
  'ZeltMiddlewareValueUnavailableError',
  formatZeltMiddlewareValueUnavailableError,
);
export type ZeltMiddlewareValueUnavailableError = InstanceType<
  typeof ZeltMiddlewareValueUnavailableError
>;

export const ZeltMiddlewareOptionsUnavailableError = /* @__PURE__ */ defineError(
  'ZeltMiddlewareOptionsUnavailableError',
  formatZeltMiddlewareOptionsUnavailableError,
);
export type ZeltMiddlewareOptionsUnavailableError = InstanceType<
  typeof ZeltMiddlewareOptionsUnavailableError
>;

export const ZeltNotImplementedError = /* @__PURE__ */ defineError(
  'ZeltNotImplementedError',
  formatZeltNotImplementedError,
);
export type ZeltNotImplementedError = InstanceType<typeof ZeltNotImplementedError>;

export const ZeltSchemaValidationError = /* @__PURE__ */ defineError(
  'ZeltSchemaValidationError',
  formatZeltSchemaValidationError,
);
export type ZeltSchemaValidationError = InstanceType<typeof ZeltSchemaValidationError>;

export const ZeltPluginConfigurationError = /* @__PURE__ */ defineError(
  'ZeltPluginConfigurationError',
  formatZeltPluginConfigurationError,
);
export type ZeltPluginConfigurationError = InstanceType<typeof ZeltPluginConfigurationError>;

export const ZeltCommandArgumentError = /* @__PURE__ */ defineError(
  'ZeltCommandArgumentError',
  formatZeltCommandArgumentError,
);
export type ZeltCommandArgumentError = InstanceType<typeof ZeltCommandArgumentError>;

export const ZeltCommandExecutionError = /* @__PURE__ */ defineError(
  'ZeltCommandExecutionError',
  formatZeltCommandExecutionError,
);
export type ZeltCommandExecutionError = InstanceType<typeof ZeltCommandExecutionError>;

export const ZeltEnvError = /* @__PURE__ */ defineError('ZeltEnvError', formatZeltEnvError);
export type ZeltEnvError = InstanceType<typeof ZeltEnvError>;

export const ZeltBodyTypeMismatchError = /* @__PURE__ */ defineError(
  'ZeltBodyTypeMismatchError',
  formatZeltBodyTypeMismatchError,
);
export type ZeltBodyTypeMismatchError = InstanceType<typeof ZeltBodyTypeMismatchError>;

export const ZeltInternalError = /* @__PURE__ */ defineError(
  'ZeltInternalError',
  formatZeltInternalError,
);
export type ZeltInternalError = InstanceType<typeof ZeltInternalError>;
