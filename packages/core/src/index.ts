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
export type { ControllerClass, HttpMetadata } from './app/modules/http-module';
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
export type { CommandContextStore } from './modules/command/command-context';
export { runInCommandContext } from './modules/command/command-context';
export { Command } from './modules/command/decorator';
export type { ExecResult } from './modules/command/exec-result';
export type { CommandMetadata } from './modules/command/metadata';
export { getCommandMetadata } from './modules/command/metadata';
export { args } from './modules/command/primitives/args';
export type { ArgDef, InferSchema, OptionDef, SchemaDefinition } from './modules/command/schema';
export { cliSchema } from './modules/command/schema';
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
// HTTP decorators
export { Authorized } from './modules/http/decorators/authorized';
export { Controller } from './modules/http/decorators/controller';
export { ErrorHandler } from './modules/http/decorators/error-handler';
export { Delete, Get, Patch, Post, Put } from './modules/http/decorators/http-method';
export { Middleware } from './modules/http/decorators/middleware';
export { SkipMiddleware } from './modules/http/decorators/skip-middleware';
export { UseMiddleware } from './modules/http/decorators/use-middleware';
export type {
  ErrorBody,
  InternalErrorBody,
  ValidationErrorBody,
  ValidationIssue,
} from './modules/http/error-schema';
export type { ControllerRouteInfo, RouteInfo } from './modules/http/internal/metadata';
export { getControllerMetadata } from './modules/http/internal/metadata';
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
// HTTP primitives
export { currentRoles, currentUser, setUser } from './modules/http/primitives/auth';
export { body } from './modules/http/primitives/body';
export { cookie } from './modules/http/primitives/cookie';
export type { RequestContextSchema } from './modules/http/primitives/get-context';
export { getContext, setContext } from './modules/http/primitives/get-context';
export { header } from './modules/http/primitives/header';
export { ip } from './modules/http/primitives/ip';
export { pathParam } from './modules/http/primitives/path-param';
export { queryParam, queryParams } from './modules/http/primitives/query-param';
export { requestContext } from './modules/http/primitives/request-context';
export type {
  CookieOptions,
  ResponseBuilder,
  ZeltSSEMessage,
  ZeltSSEWriter,
  ZeltStreamWriter,
} from './modules/http/primitives/response';
export { response } from './modules/http/primitives/response';
export { method, path, url } from './modules/http/primitives/url';
export type {
  ExtractValidated,
  ExtractValidationTarget,
  IsValidated,
  ValidatedMarker,
  ValidationTarget,
} from './modules/http/primitives/validated-types';
// Scheduler decorators
export { Cron } from './modules/scheduler/decorators/cron';
export { Daily } from './modules/scheduler/decorators/daily';
export { Every } from './modules/scheduler/decorators/every';
export { Hourly } from './modules/scheduler/decorators/hourly';
export { Scheduled } from './modules/scheduler/decorators/scheduled';
export { Weekly } from './modules/scheduler/decorators/weekly';
