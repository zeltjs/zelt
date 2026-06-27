export { HTTPException } from 'hono/http-exception';
export type {
  App,
  App as FeatureApp,
  CreateAppOptions,
  CreateRuntimeOptions,
  ReadyResult,
  RuntimeApp,
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
  FeatureCaps,
  FeatureClass,
  FeatureManagedClass,
  FeatureReadyCapabilities,
  HttpCapabilities,
  HttpMountableCapabilities,
  HttpMountableFeatureModule,
  HttpStaticCapabilities,
  NamespacedCaps,
  SchedulerCapabilities,
  ServiceResolver,
  StaticNamespacedCaps,
} from './features';
// Feature factories
export {
  CommandFeature,
  command,
  Feature,
  HTTP_FEATURE_KEY,
  HttpFeature,
  http,
  SchedulerFeature,
  scheduler,
} from './features';
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
} from './features/command/command.types';
export type { CommandMetadata } from './features/command/definition';
export { Command, getCommandMetadata } from './features/command/definition';
export type { ExecResult } from './features/command/exec-result.types';
export type { CommandContextStore } from './features/command/input';
export { runInCommandContext } from './features/command/input';
export type {
  ArgDef,
  InferSchema,
  OptionDef,
  SchemaDefinition,
} from './features/command/input/command-schema.types';
export { cliSchema } from './features/command/input/command-schema.types';
export { args } from './features/command/input/injection';
export type {
  ErrorBody,
  InternalErrorBody,
  ValidationErrorBody,
  ValidationIssue,
} from './features/http/error/error.types';
export { ErrorHandler } from './features/http/error/error-handler.decorator';
export type { HttpMetadata } from './features/http/http.service';
export type {
  ControllerClass,
  HttpChildOptions,
  HttpModuleOptions,
} from './features/http/http.types';
// HTTP primitives
export { currentRoles, currentUser, setUser } from './features/http/middleware/auth';
// HTTP decorators
export { Authorized } from './features/http/middleware/auth/authorized.decorator';
export { CorsConfig } from './features/http/middleware/cors/cors.config';
export { CorsMiddleware } from './features/http/middleware/cors/cors.middleware';
export { Middleware } from './features/http/middleware/middleware.decorator';
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
} from './features/http/middleware/middleware.types';
export { SecureHeadersConfig } from './features/http/middleware/secure-headers/secure-headers.config';
export { SecureHeadersMiddleware } from './features/http/middleware/secure-headers/secure-headers.middleware';
export { SkipMiddleware } from './features/http/middleware/skip-middleware.decorator';
export { UseMiddleware } from './features/http/middleware/use-middleware.decorator';
export {
  AsyncValidationUnsupportedException,
  requestContext,
  ValidationFailedException,
} from './features/http/request';
export type { RequestContextSchema } from './features/http/request/injection';
export {
  getContext,
  request,
  setContext,
} from './features/http/request/injection';
export type {
  ExtractRequestBody,
  HasRequestBody,
  RequestAccessor,
} from './features/http/request/validated.types';
export type {
  CookieOptions,
  ResponseBuilder,
  ZeltSSEMessage,
  ZeltSSEWriter,
  ZeltStreamWriter,
} from './features/http/response';
export { response } from './features/http/response';
export type { ControllerRouteInfo, RouteInfo } from './features/http/routing';
export { getControllerMetadata } from './features/http/routing';
export { Controller } from './features/http/routing/controller.decorator';
export { Delete, Get, Patch, Post, Put } from './features/http/routing/http-method.decorator';
// Scheduler decorators
export { Cron } from './features/scheduler/schedule/cron.decorator';
export { Daily } from './features/scheduler/schedule/daily.decorator';
export { Every } from './features/scheduler/schedule/every.decorator';
export { Hourly } from './features/scheduler/schedule/hourly.decorator';
export { Scheduled } from './features/scheduler/schedule/scheduled.decorator';
export { Weekly } from './features/scheduler/schedule/weekly.decorator';
export type { SchedulerClass } from './features/scheduler/scheduler.types';
export type { Lifecycle } from './kernel';
export { LifecycleManager, runInContext } from './kernel';
// DI primitives
// DI
export { Injectable, inject } from './kernel/di';
export type { CoreErrorContextMap, HttpExceptionClass } from './kernel/errors';
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
