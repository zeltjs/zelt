import type {
  AnyMiddlewareWithOptionsClass,
  BoundMiddleware,
  MiddlewareOptionsOf,
} from './middleware.types';
import { BOUND_MIDDLEWARE_BRAND } from './middleware.types';

/**
 * Base class for middleware that needs configuration. Bind options with the
 * static `.with()` factory; the returned value is the middleware's identity
 * everywhere it's used (`@UseMiddleware`, `middlewares:`, `optionsOf()`,
 * `resultOf()`), so store it in a `const` and reuse that reference — calling
 * `.with()` again, even with identical options, produces a different identity.
 */
export abstract class MiddlewareWithOptions<TOptions = undefined> {
  // Structural contract with OptionsPhantom in middleware.types.ts — keep the
  // two in sync. Must stay a plain (non-`protected`/`private`) member: TS
  // compares protected/private members nominally, so the structural
  // OptionsPhantom pattern could never match one.
  declare readonly __optionsPhantom: (options: TOptions) => void;

  // No abstract use() — it would recreate the self-reference cycle that
  // MiddlewareOptionsClass (middleware.types.ts) exists to avoid.
  static with<C extends AnyMiddlewareWithOptionsClass>(
    this: C,
    options: MiddlewareOptionsOf<C>,
  ): BoundMiddleware<C> {
    // biome-ignore lint/complexity/noThisInStatic: `this` IS the calling subclass — biome's fix substitutes the base class, binding every subclass's options to it
    return { middleware: this, options, [BOUND_MIDDLEWARE_BRAND]: true };
  }
}
