import type { Context, Env, Input, MiddlewareHandler } from 'hono';

export type HonoMiddleware = MiddlewareHandler<Env, string, Input>;

// The zero-arg branch must match `void` EXACTLY, not anything assignable to it:
// `[T] extends [void]` alone also captures T = undefined (undefined is
// assignable to void), which would silently turn Next<undefined> into a
// zero-arg function — but Next<undefined> is a legitimate "provides an
// explicit undefined" contract, distinguished at runtime via arguments.length.
// The double check ([T] extends [void] and [void] extends [T]) is only true
// for void itself.
// biome-ignore lint/suspicious/noConfusingVoidType: void vs undefined is the point of this check; biome's unsafe fix to `undefined` breaks Next resolution
export type Next<T = void> = [T] extends [void]
  ? [void] extends [T]
    ? () => Promise<void>
    : (value: T) => Promise<void>
  : (value: T) => Promise<void>;

type MaybePromise<T> = T | Promise<T>;

export type MiddlewareResult = MaybePromise<Response | undefined>;

// Middleware that needs options extends MiddlewareWithOptions<TOptions> and
// reads them via middlewareOptions() inside use().
export type MiddlewareInstance = {
  use(next: Next): MiddlewareResult;
};

export type MiddlewareClass = new (...args: never[]) => MiddlewareInstance;

export type RequestContext = Context<Env, string, Input>;

// Structural stand-in for MiddlewareWithOptions<TOptions>'s instance shape,
// spelled out instead of importing the class so this file stays import-cycle
// free with middleware-with-options.lib.ts (which imports its types from here).
// The phantom must sit in parameter (contravariant) position: a plain
// TOptions-typed field is covariant, making the `never`-bound constraints
// below reject every subclass instead of accepting them all.
type OptionsPhantom<TOptions> = {
  readonly __optionsPhantom: (options: TOptions) => void;
};

// Deliberately ONE constructor signature returning an intersection instance
// type — not an intersection of two constructor types: generic inference
// through intersected constructor signatures (e.g. ResolverHandle.get) picks
// up only one branch, silently dropping use() from the inferred type.
export type AnyMiddlewareWithOptionsClass = new (
  ...args: never[]
) => MiddlewareInstance & OptionsPhantom<never>;

// Deliberately does NOT require use(): middlewareOptions(Self) is written as a default
// parameter of Self's own use(), so a use()-requiring constraint would make
// checking that call depend on resolving the very signature being checked, and
// TS types `opts` as an implicit any (verified). `.with()` is the side that
// requires use() (via AnyMiddlewareWithOptionsClass) — it's called after the
// subclass is fully resolved, so no cycle exists there.
export type MiddlewareOptionsClass = new (...args: never[]) => OptionsPhantom<never>;

// Extracts the TOptions a concrete MiddlewareWithOptions subclass was declared with.
export type MiddlewareOptionsOf<C> = C extends new (
  ...args: never[]
) => OptionsPhantom<infer T>
  ? T
  : never;

// BoundMiddleware is otherwise just { middleware, options } — purely
// structural, so without this brand any object literal shaped like one would
// satisfy the type, letting options: unknown skip all validation (e.g.
// `{ middleware: RateLimitMiddleware, options: { limit: 'nope' } }` registered
// directly via @UseMiddleware/middlewares:, bypassing MiddlewareWithOptions
// entirely). Real (not `declare`d) so MiddlewareWithOptions.with(), the only
// legitimate producer, can actually set it — a `declare`-only phantom can't be
// assigned in a plain object literal without an inline `as`, which is banned.
// Not re-exported from middleware/index.ts or the package's public index.ts:
// packages/core's package.json "exports" only exposes dist/index.js, so code
// outside this package can never import this symbol to forge one.
export const BOUND_MIDDLEWARE_BRAND: unique symbol = Symbol('zelt:bound-middleware');

// Produced by MiddlewareWithOptions.with(options); this value (not the class)
// is what identifies the binding everywhere — @UseMiddleware, middlewares:,
// middlewareOptions(), middlewareValue() — since one class can be bound to several option sets.
// TClass is preserved (not widened to MiddlewareClass) so middlewareValue() can still
// recover the concrete middleware's provided-value type through `.middleware`.
export type BoundMiddleware<
  TClass extends AnyMiddlewareWithOptionsClass = AnyMiddlewareWithOptionsClass,
> = {
  readonly middleware: TClass;
  readonly options: unknown;
  [BOUND_MIDDLEWARE_BRAND]: true;
};

export type MiddlewareInput = MiddlewareClass | BoundMiddleware;

export type MiddlewareIdentifier = MiddlewareClass | BoundMiddleware;

export type ErrorHandlerClass = new (...args: never[]) => ErrorHandlerInstance;

export type ErrorHandlerInstance = {
  onError(error: Error, c: RequestContext): Response | Promise<Response | undefined> | undefined;
};
