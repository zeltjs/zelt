export { createHttpApp } from './http/app';
export type { CreateHttpAppOptions, HttpApp } from './http/app';

export { validationErrorBodySchema } from './http/error-schema';
export type { ValidationErrorBody } from './http/error-schema';
export { errorBodySchema } from './http/error-schema';
export type { ErrorBody } from './http/error-schema';

export { HTTPException } from 'hono/http-exception';

export { Authorized } from './decorators/authorized';
export { Controller } from './decorators/controller';
export { ErrorHandler } from './decorators/error-handler';
export { Delete, Get, Patch, Post, Put } from './decorators/http-method';
export { Injectable } from './decorators/injectable';
export { Middleware } from './decorators/middleware';
export { SkipMiddleware } from './decorators/skip-middleware';
export { UseMiddleware } from './decorators/use-middleware';

export type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  FunctionMiddleware,
  MiddlewareClass,
  MiddlewareIdentifier,
  MiddlewareInput,
  MiddlewareInstance,
  Next,
  RequestContext,
} from './middleware/types';

export { currentRoles, currentUser, setUser } from './primitives/auth';
export { getContext, setContext } from './primitives/get-context';
export type { RequestContextSchema } from './primitives/get-context';
export { inject } from './primitives/inject';
export { pathParam } from './primitives/path-param';
export { response } from './primitives/response';
export type { ResponseBuilder } from './primitives/response';
export { validated } from './primitives/validated';
export type {
  ValidatedMarker,
  ExtractValidated,
  ExtractValidationTarget,
  IsValidated,
  ValidationTarget,
} from './primitives/validated';

export { Config, injectConfig } from './config';
export type { ConfigClass } from './config';

export { resolveWith } from './internal/container';
export type { ResolverHandle } from './internal/container';

export { LifecycleManager } from './lifecycle';
export type { Disposable } from './lifecycle';
