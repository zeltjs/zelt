export { createApp } from './app/create-app';
export type {
  App,
  HttpApp,
  CommandApp,
  CreateAppOptions,
  HttpOptions,
  ReadyOptions,
  ReadyResult,
  ControllerClass,
  SchedulerClass,
} from './app/types';

export type {
  ValidationErrorBody,
  ErrorBody,
  ValidationIssue,
  InternalErrorBody,
} from './http/error-schema';

export { HTTPException } from 'hono/http-exception';

// HTTP decorators
export { Authorized } from './http/decorators/authorized';
export { Controller } from './http/decorators/controller';
export { ErrorHandler } from './http/decorators/error-handler';
export { Delete, Get, Patch, Post, Put } from './http/decorators/http-method';
export { Middleware } from './http/decorators/middleware';
export { SkipMiddleware } from './http/decorators/skip-middleware';
export { UseMiddleware } from './http/decorators/use-middleware';

// Scheduler decorators
export { Cron } from './scheduler/decorators/cron';
export { Daily } from './scheduler/decorators/daily';
export { Every } from './scheduler/decorators/every';
export { Hourly } from './scheduler/decorators/hourly';
export { Scheduled } from './scheduler/decorators/scheduled';
export { Weekly } from './scheduler/decorators/weekly';

// DI
export { Injectable } from './di/injectable';

export { Command } from './command/decorator';
export { getCommandMetadata, setCommandMetadata } from './command/metadata';
export type { CommandMetadata } from './command/metadata';
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
} from './command/types';
export { cliSchema } from './command/schema';
export type { ArgDef, InferSchema, OptionDef, SchemaDefinition } from './command/schema';
export { args } from './command/primitives/args';
export { runInCommandContext } from './command/command-context';
export type { CommandContextStore } from './command/command-context';

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
} from './http/middleware/types';

// HTTP primitives
export { currentRoles, currentUser, setUser } from './http/primitives/auth';
export { body } from './http/primitives/body';
export { cookie } from './http/primitives/cookie';
export { ip } from './http/primitives/ip';
export { getContext, setContext } from './http/primitives/get-context';
export type { RequestContextSchema } from './http/primitives/get-context';
export { header } from './http/primitives/header';
export { pathParam } from './http/primitives/path-param';
export { queryParam, queryParams } from './http/primitives/query-param';
export { requestContext } from './http/primitives/request-context';
export { response } from './http/primitives/response';
export type { CookieOptions, ResponseBuilder } from './http/primitives/response';
export { method, path, url } from './http/primitives/url';
export type {
  ValidatedMarker,
  ExtractValidated,
  ExtractValidationTarget,
  IsValidated,
  ValidationTarget,
} from './http/primitives/validated-types';

// DI primitives
export { inject } from './di/inject';

export { Config, injectConfig, overrideConfig } from './config';
export type { ConfigClass } from './config';

export { LifecycleManager } from './lifecycle';
export type { Lifecycle, Disposable } from './lifecycle';

export {
  Logger,
  LoggerService,
  LoggerConfig,
  withLogContext,
  getLogContext,
  safeStringify,
  JsonlFormatter,
  PrettyFormatter,
  PrettyFormatterConfig,
  ConsoleTransport,
} from './modules/logger';
export type {
  LogLevel,
  LogContext,
  LogEntry,
  TransportBinding,
  LoggerFormatter,
  LoggerTransport,
} from './modules/logger';

export { CliConfig } from './modules/cli';
export type { Signal, SignalHandler } from './modules/cli';
export { EnvConfig, EnvService } from './modules/env';
