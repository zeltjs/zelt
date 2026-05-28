export type ValidationTarget = 'json' | 'form';

declare const __zeltValidatedBrand: unique symbol;
declare const __zeltValidatedType: unique symbol;
declare const __zeltValidatedTarget: unique symbol;

export type ValidatedMarker<T, Target extends ValidationTarget = 'json'> = T & {
  [__zeltValidatedBrand]: true;
  [__zeltValidatedType]: T;
  [__zeltValidatedTarget]: Target;
};

export type ExtractValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedType, infer T> ? T : never;

export type ExtractValidationTarget<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedTarget, infer T extends ValidationTarget>
    ? T
    : 'json';

export type IsValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedBrand, true> ? true : false;
