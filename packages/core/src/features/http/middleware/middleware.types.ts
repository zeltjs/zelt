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
// reads them via optionsOf() inside use().
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

// Deliberately does NOT require use(): optionsOf(Self) is written as a default
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

// Produced by MiddlewareWithOptions.with(options); this value (not the class)
// is what identifies the binding everywhere — @UseMiddleware, middlewares:,
// optionsOf(), resultOf() — since one class can be bound to several option sets.
// TClass is preserved (not widened to MiddlewareClass) so resultOf() can still
// recover the concrete middleware's provided-value type through `.middleware`.
export type BoundMiddleware<
  TClass extends AnyMiddlewareWithOptionsClass = AnyMiddlewareWithOptionsClass,
> = {
  readonly middleware: TClass;
  readonly options: unknown;
};

export type MiddlewareInput = MiddlewareClass | BoundMiddleware;

export type MiddlewareIdentifier = MiddlewareClass | BoundMiddleware;

export type ErrorHandlerClass = new (...args: never[]) => ErrorHandlerInstance;

export type ErrorHandlerInstance = {
  onError(error: Error, c: RequestContext): Response | Promise<Response | undefined> | undefined;
};
