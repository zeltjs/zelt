import { describe, expect, it } from 'vitest';

import {
  ZeltAppConfigurationError,
  ZeltContextNotAvailableError,
  ZeltDecoratorUsageError,
  ZeltInternalError,
  ZeltLifecycleStateError,
  ZeltMiddlewareExecutionError,
  ZeltNotImplementedError,
  ZeltReadyFailedError,
  ZeltRouteConfigurationError,
} from './index';

describe('ZeltDecoratorUsageError', () => {
  it('formats static_method reason correctly', () => {
    const error = new ZeltDecoratorUsageError({
      decoratorName: 'Authorized',
      reason: 'static_method',
    });
    expect(error.message).toBe('@Authorized cannot be applied to static methods');
    expect(error.name).toBe('ZeltDecoratorUsageError');
    expect(error.context).toEqual({ decoratorName: 'Authorized', reason: 'static_method' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ZeltDecoratorUsageError);
  });

  it('supports cause for error chaining', () => {
    const originalError = new Error('original cause');
    const error = new ZeltDecoratorUsageError(
      { decoratorName: 'Get', reason: 'static_method' },
      originalError,
    );
    expect(error.cause).toBe(originalError);
  });

  it('formats missing_decorator reason correctly', () => {
    const error = new ZeltDecoratorUsageError({
      decoratorName: 'Controller',
      reason: 'missing_decorator',
      targetName: 'UserController',
    });
    expect(error.message).toBe('UserController is missing @Controller decorator');
  });

  it('uses default targetName when not provided', () => {
    const error = new ZeltDecoratorUsageError({
      decoratorName: 'Controller',
      reason: 'missing_decorator',
    });
    expect(error.message).toBe('class is missing @Controller decorator');
  });
});

describe('ZeltLifecycleStateError', () => {
  it('formats disposed state correctly', () => {
    const error = new ZeltLifecycleStateError({
      operation: 'ready',
      currentState: 'disposed',
    });
    expect(error.message).toBe('Cannot ready() after shutdown()');
    expect(error.name).toBe('ZeltLifecycleStateError');
    expect(error).toBeInstanceOf(ZeltLifecycleStateError);
  });

  it('formats ready state correctly', () => {
    const error = new ZeltLifecycleStateError({
      operation: 'addFallbackConfig',
      currentState: 'ready',
    });
    expect(error.message).toBe('Cannot addFallbackConfig() after createRuntime()');
  });

  it('formats not_ready state correctly', () => {
    const error = new ZeltLifecycleStateError({
      operation: 'fetch',
      currentState: 'not_ready',
    });
    expect(error.message).toBe('Cannot fetch() before createRuntime()');
  });
});

describe('ZeltReadyFailedError', () => {
  it('formats lifecycle startup failure and preserves cause', () => {
    const cause = new Error('startup failed');
    const error = new ZeltReadyFailedError({ lifecycleName: 'HttpService' }, cause);

    expect(error.message).toBe('Lifecycle startup failed: HttpService');
    expect(error.name).toBe('ZeltReadyFailedError');
    expect(error.context).toEqual({ lifecycleName: 'HttpService' });
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(ZeltReadyFailedError);
  });
});

describe('ZeltContextNotAvailableError', () => {
  it('formats entry context correctly', () => {
    const error = new ZeltContextNotAvailableError({
      primitive: 'response',
      requiredContext: 'entry',
    });
    expect(error.message).toBe('response() called outside entry execution');
    expect(error.name).toBe('ZeltContextNotAvailableError');
    expect(error).toBeInstanceOf(ZeltContextNotAvailableError);
  });

  it('formats command context correctly', () => {
    const error = new ZeltContextNotAvailableError({
      primitive: 'args',
      requiredContext: 'command',
    });
    expect(error.message).toBe('args() called outside command execution');
  });
});

describe('ZeltAppConfigurationError', () => {
  it('formats duplicate_command reason correctly', () => {
    const error = new ZeltAppConfigurationError({
      reason: 'duplicate_command',
      details: 'build',
    });
    expect(error.message).toBe('Duplicate command name: build');
    expect(error.name).toBe('ZeltAppConfigurationError');
    expect(error).toBeInstanceOf(ZeltAppConfigurationError);
  });

  it('formats duplicate_feature_key reason correctly', () => {
    const error = new ZeltAppConfigurationError({
      reason: 'duplicate_feature_key',
      details: 'http',
    });
    expect(error.message).toBe('Duplicate feature namespace: http');
  });

  it('formats reserved_feature_key reason correctly', () => {
    const error = new ZeltAppConfigurationError({
      reason: 'reserved_feature_key',
      details: 'createRuntime',
    });
    expect(error.message).toBe('Reserved feature namespace: createRuntime');
  });
});

describe('ZeltRouteConfigurationError', () => {
  it('formats missing_path_param reason correctly', () => {
    const error = new ZeltRouteConfigurationError({
      reason: 'missing_path_param',
      paramName: 'id',
    });
    expect(error.message).toBe('path parameter "id" is not defined');
    expect(error.name).toBe('ZeltRouteConfigurationError');
    expect(error).toBeInstanceOf(ZeltRouteConfigurationError);
  });

  it('formats invalid_route reason correctly', () => {
    const error = new ZeltRouteConfigurationError({
      reason: 'invalid_route',
    });
    expect(error.message).toBe('Invalid route configuration');
  });
});

describe('ZeltMiddlewareExecutionError', () => {
  it('formats error with middleware name', () => {
    const error = new ZeltMiddlewareExecutionError({
      reason: 'next_called_multiple_times',
      middlewareName: 'AuthMiddleware',
    });
    expect(error.message).toBe("next() called multiple times in middleware 'AuthMiddleware'");
    expect(error.name).toBe('ZeltMiddlewareExecutionError');
    expect(error.context.middlewareName).toBe('AuthMiddleware');
    expect(error).toBeInstanceOf(ZeltMiddlewareExecutionError);
  });

  it('formats error with anonymous middleware', () => {
    const error = new ZeltMiddlewareExecutionError({
      reason: 'next_called_multiple_times',
      middlewareName: '<anonymous>',
    });
    expect(error.message).toBe("next() called multiple times in middleware '<anonymous>'");
  });
});

describe('ZeltNotImplementedError', () => {
  it('formats not implemented error correctly', () => {
    const error = new ZeltNotImplementedError({
      className: 'CliConfig',
      methodName: 'cwd',
    });
    expect(error.message).toBe('CliConfig.cwd() not implemented');
    expect(error.name).toBe('ZeltNotImplementedError');
    expect(error).toBeInstanceOf(ZeltNotImplementedError);
  });
});

describe('ZeltInternalError', () => {
  it('formats http router initialization failure and preserves cause', () => {
    const cause = new Error('router failed');
    const error = new ZeltInternalError({ reason: 'http_router_init_failed' }, cause);

    expect(error.message).toBe('HttpService createLocalRouter failed');
    expect(error.name).toBe('ZeltInternalError');
    expect(error.context).toEqual({ reason: 'http_router_init_failed' });
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(ZeltInternalError);
  });
});
