import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel';
import type { HttpStatusCode, ResponseBuilder } from '../response';
import type { HttpMethod } from './routing-metadata.lib';

type RouteCallable = (...args: never[]) => unknown;
type ReturnContract<T extends RouteCallable> = [
  Extract<Awaited<ReturnType<T>>, Response | ResponseBuilder<HttpStatusCode>>,
] extends [never]
  ? unknown
  : { invalidControllerReturn: 'Return JSON data or finished response() reply data' };

type HttpMethodDecorator = {
  <T extends RouteCallable>(
    value: T & ReturnContract<T>,
    context: ClassMethodDecoratorContext,
  ): void;
  <T extends RouteCallable>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T> & ReturnContract<T>,
  ): void;
};

/** @throws {E} */
const makeDecorator =
  (method: HttpMethod) =>
  (path: string): HttpMethodDecorator =>
    createMethodDecorator({ decorator: 'Route' as const, method, path } as const, {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: method, reason: 'static_method' }),
    });

export const Get = makeDecorator('GET');
export const Post = makeDecorator('POST');
export const Put = makeDecorator('PUT');
export const Patch = makeDecorator('PATCH');
export const Delete = makeDecorator('DELETE');
