export { HTTPException } from 'hono/http-exception';
export {
  type App,
  type CommandApp,
  type CreateAppOptions,
  createApp,
  type HttpApp,
  type ReadyOptions,
  type ReadyResult,
  type SchedulerApp,
} from './app/create-app';
export type { DefaultModulesConfig } from './app/default-modules';
export type { Signal, SignalHandler } from './built-in-service/cli';
export { CliConfig } from './built-in-service/cli';
export type { ConfigClass } from './built-in-service/config';
export { Config, overrideConfig } from './built-in-service/config';
export { Env, EnvConfig, EnvService, EnvSource } from './built-in-service/env';
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
  safeStringify,
  withLogContext,
} from './built-in-service/logger';
// DI primitives
export { inject } from './kernel/di/inject';
// DI
export { Injectable } from './kernel/di/injectable';
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
export type { Disposable, Lifecycle } from './kernel/lifecycle';
export { LifecycleManager } from './kernel/lifecycle';
export { Command } from './modules/command/definition/decorator';
export type { CommandMetadata } from './modules/command/definition/metadata';
export { getCommandMetadata } from './modules/command/definition/metadata';
export type { ExecResult } from './modules/command/exec-result';
export type { CommandContextStore } from './modules/command/input/command-context';
export { runInCommandContext } from './modules/command/input/command-context';
export { args } from './modules/command/input/injection/args';
export type {
  ArgDef,
  InferSchema,
  OptionDef,
  SchemaDefinition,
} from './modules/command/input/schema';
export { cliSchema } from './modules/command/input/schema';
export type { CommandCapabilities } from './modules/command/module';
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
} from './modules/command/types';
export { ErrorHandler } from './modules/http/error/error-handler';
export type {
  ErrorBody,
  InternalErrorBody,
  ValidationErrorBody,
  ValidationIssue,
} from './modules/http/error/error-schema';
// HTTP primitives
export { currentRoles, currentUser, setUser } from './modules/http/middleware/auth/auth';
// HTTP decorators
export { Authorized } from './modules/http/middleware/auth/authorized';
export { CorsConfig } from './modules/http/middleware/cors/cors.config';
export { CorsMiddleware } from './modules/http/middleware/cors/cors.middleware';
export { Middleware } from './modules/http/middleware/middleware';
export { SecureHeadersConfig } from './modules/http/middleware/secure-headers/secure-headers.config';
export { SecureHeadersMiddleware } from './modules/http/middleware/secure-headers/secure-headers.middleware';
export { SkipMiddleware } from './modules/http/middleware/skip-middleware';
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
} from './modules/http/middleware/types';
export { UseMiddleware } from './modules/http/middleware/use-middleware';
export type { ControllerClass, HttpCapabilities, HttpMetadata } from './modules/http/module';
export { body } from './modules/http/request/injection/body';
export { cookie } from './modules/http/request/injection/cookie';
export type { RequestContextSchema } from './modules/http/request/injection/get-context';
export { getContext, setContext } from './modules/http/request/injection/get-context';
export { header } from './modules/http/request/injection/header';
export { ip } from './modules/http/request/injection/ip';
export { pathParam } from './modules/http/request/injection/path-param';
export { queryParam, queryParams } from './modules/http/request/injection/query-param';
export { method, path, url } from './modules/http/request/injection/url';
export { requestContext } from './modules/http/request/request-context';
export type {
  ExtractValidated,
  ExtractValidationTarget,
  IsValidated,
  ValidatedMarker,
  ValidationTarget,
} from './modules/http/request/validated-types';
export type {
  CookieOptions,
  ResponseBuilder,
  ZeltSSEMessage,
  ZeltSSEWriter,
  ZeltStreamWriter,
} from './modules/http/response/response';
export { response } from './modules/http/response/response';
export { Controller } from './modules/http/routing/controller';
export { Delete, Get, Patch, Post, Put } from './modules/http/routing/http-method';
export type { ControllerRouteInfo, RouteInfo } from './modules/http/routing/metadata';
export { getControllerMetadata } from './modules/http/routing/metadata';
export type { Module, ModuleCapsMap, ModuleConfigMap } from './modules/module';
export type { SchedulerCapabilities, SchedulerClass } from './modules/scheduler/module';
// Scheduler decorators
export { Cron } from './modules/scheduler/schedule/cron';
export { Daily } from './modules/scheduler/schedule/daily';
export { Every } from './modules/scheduler/schedule/every';
export { Hourly } from './modules/scheduler/schedule/hourly';
export { Scheduled } from './modules/scheduler/schedule/scheduled';
export { Weekly } from './modules/scheduler/schedule/weekly';
