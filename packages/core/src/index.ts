export { HTTPException } from 'hono/http-exception';
export type {
  App,
  App as FeatureApp,
  AppRequiring,
  CreateAppOptions,
  ReadyApp,
  ReadyOptions,
  ReadyResult,
} from './app';
export { createApp } from './app';
export type { Signal, SignalHandler } from './built-in-service/cli';
export { CliConfig } from './built-in-service/cli';
export type { ConfigClass } from './built-in-service/config';
export { Config, overrideConfig } from './built-in-service/config';
export { Env, EnvAdaptor } from './built-in-service/env';
export type {
  LogContext,
  LogEntry,
  LoggerFormatter,
  LoggerTransport,
  LogLevel,
  TransportBinding,
} from './built-in-service/logger';
export {
  ConsoleTransport,
  getLogContext,
  JsonlFormatter,
  Logger,
  LoggerConfig,
  LoggerService,
  PrettyFormatter,
  PrettyFormatterConfig,
  withLogContext,
} from './built-in-service/logger';
export type {
  CommandCapabilities,
  ConfiguredFeature,
  HttpCapabilities,
  SchedulerCapabilities,
} from './features';
// Feature factories
export { command, http, scheduler } from './features';
export type { Lifecycle } from './kernel';
export { LifecycleManager } from './kernel';
// DI primitives
// DI
export { Injectable, inject } from './kernel/di';
export type { CoreErrorContextMap } from './kernel/errors';
// Errors
export {
  defineHttpException,
  ZeltAppConfigurationError,
  ZeltCommandArgumentError,
  ZeltCommandExecutionError,
  ZeltContextNotAvailableError,
  ZeltDecoratorUsageError,
  ZeltEnvError,
  ZeltLifecycleStateError,
  ZeltMiddlewareExecutionError,
  ZeltNotImplementedError,
  ZeltPluginConfigurationError,
  ZeltRouteConfigurationError,
  ZeltSchemaValidationError,
} from './kernel/errors';
export type { ReadyValue } from './kernel/internal';
export type {
  ArgDefinition,
  ArgsDefinition,
  CommandClass,
  CommandContext,
  CommandRunner,
  InferArgs,
  InferOptions,
  OptionDefinition,
  OptionsDefinition,
} from './modules/command/command.types';
export type { CommandMetadata } from './modules/command/definition';
export { Command, getCommandMetadata } from './modules/command/definition';
export type { ExecResult } from './modules/command/exec-result.types';
export type { CommandContextStore } from './modules/command/input';
export { runInCommandContext } from './modules/command/input';
export type {
  ArgDef,
  InferSchema,
  OptionDef,
  SchemaDefinition,
} from './modules/command/input/command-schema.types';
export { cliSchema } from './modules/command/input/command-schema.types';
export { args } from './modules/command/input/injection';
export type {
  ErrorBody,
  InternalErrorBody,
  ValidationErrorBody,
  ValidationIssue,
} from './modules/http/error/error.types';
export { ErrorHandler } from './modules/http/error/error-handler.decorator';
export type { HttpMetadata } from './modules/http/http.service';
export type { ControllerClass } from './modules/http/http.types';
// HTTP primitives
export { currentRoles, currentUser, setUser } from './modules/http/middleware/auth';
// HTTP decorators
export { Authorized } from './modules/http/middleware/auth/authorized.decorator';
export { CorsConfig } from './modules/http/middleware/cors/cors.config';
export { CorsMiddleware } from './modules/http/middleware/cors/cors.middleware';
export { Middleware } from './modules/http/middleware/middleware.decorator';
export type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  FunctionMiddleware,
  MiddlewareClass,
  MiddlewareIdentifier,
  MiddlewareInput,
  MiddlewareInputWithOptions,
  MiddlewareInstance,
  Next,
  RequestContext,
} from './modules/http/middleware/middleware.types';
export { SecureHeadersConfig } from './modules/http/middleware/secure-headers/secure-headers.config';
export { SecureHeadersMiddleware } from './modules/http/middleware/secure-headers/secure-headers.middleware';
export { SkipMiddleware } from './modules/http/middleware/skip-middleware.decorator';
export { UseMiddleware } from './modules/http/middleware/use-middleware.decorator';
export { requestContext } from './modules/http/request';
export type { RequestContextSchema } from './modules/http/request/injection';
export {
  body,
  cookie,
  getContext,
  header,
  ip,
  method,
  path,
  pathParam,
  queryParam,
  queryParams,
  setContext,
  url,
} from './modules/http/request/injection';
export type {
  ExtractValidated,
  ExtractValidationTarget,
  IsValidated,
  ValidatedMarker,
  ValidationTarget,
} from './modules/http/request/validated.types';
export type {
  CookieOptions,
  ResponseBuilder,
  ZeltSSEMessage,
  ZeltSSEWriter,
  ZeltStreamWriter,
} from './modules/http/response';
export { response } from './modules/http/response';
export type { ControllerRouteInfo, RouteInfo } from './modules/http/routing';
export { getControllerMetadata } from './modules/http/routing';
export { Controller } from './modules/http/routing/controller.decorator';
export { Delete, Get, Patch, Post, Put } from './modules/http/routing/http-method.decorator';
// Scheduler decorators
export { Cron } from './modules/scheduler/schedule/cron.decorator';
export { Daily } from './modules/scheduler/schedule/daily.decorator';
export { Every } from './modules/scheduler/schedule/every.decorator';
export { Hourly } from './modules/scheduler/schedule/hourly.decorator';
export { Scheduled } from './modules/scheduler/schedule/scheduled.decorator';
export { Weekly } from './modules/scheduler/schedule/weekly.decorator';
export type { SchedulerClass } from './modules/scheduler/scheduler.types';
