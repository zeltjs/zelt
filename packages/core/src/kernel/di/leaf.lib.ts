import type { Container } from '@needle-di/core';
import { InjectionToken } from '@needle-di/core';
import { isClassConstructor, UnsafeInjectionTokenWeakMap } from '@zeltjs/unsafe-type-lib';

type AnyClass<T extends object = object> = abstract new (...args: never[]) => T;
type AnyInstance = object;

type LeafInjectionToken<T extends object = object> = InjectionToken<T>;

const leafTokenDescription = (cls: AnyClass): string => `zelt:leaf:${cls.name}`;

const leafClasses = new WeakSet<AnyClass>();
const abstractLeafClasses = new WeakSet<AnyClass>();
const abstractLeafTokenLabels = new Map<string, AnyClass>();
const leafCategoryCache = new WeakMap<AnyClass, 'direct' | 'inherited'>();
const leafTokenMap = new UnsafeInjectionTokenWeakMap();
const boundTokens = new WeakMap<Container, Set<LeafInjectionToken>>();

const toAnyClass = (proto: unknown): AnyClass | null => {
  if (proto === null || proto === Function.prototype) return null;
  return isClassConstructor<AnyInstance>(proto) ? proto : null;
};

export const registerAsLeaf = (cls: AnyClass, options?: { readonly abstract?: boolean }): void => {
  leafClasses.add(cls);
  if (options?.abstract === true) {
    abstractLeafClasses.add(cls);
    const existingToken = leafTokenMap.get(cls);
    if (existingToken) abstractLeafTokenLabels.set(existingToken.toString(), cls);
  }
  leafCategoryCache.set(cls, 'direct');
};

const isAbstractLeafClass = (cls: AnyClass): boolean => abstractLeafClasses.has(cls);

const rememberAbstractLeafToken = (cls: AnyClass, token: LeafInjectionToken): void => {
  if (isAbstractLeafClass(cls)) abstractLeafTokenLabels.set(token.toString(), cls);
};

/** @throws {ZeltLifecycleStateError} */
export const isLeafClass = (cls: AnyClass): boolean => {
  const cached = leafCategoryCache.get(cls);
  if (cached !== undefined) return true;

  if (leafClasses.has(cls)) {
    leafCategoryCache.set(cls, 'direct');
    return true;
  }

  let current = toAnyClass(Object.getPrototypeOf(cls));
  while (current) {
    if (leafClasses.has(current)) {
      leafCategoryCache.set(cls, 'inherited');
      return true;
    }
    current = toAnyClass(Object.getPrototypeOf(current));
  }

  return false;
};

const findAncestorLeafClasses = (cls: AnyClass): AnyClass[] => {
  const ancestors: AnyClass[] = [];
  let current = toAnyClass(Object.getPrototypeOf(cls));

  while (current) {
    if (leafClasses.has(current)) {
      ancestors.push(current);
    }
    current = toAnyClass(Object.getPrototypeOf(current));
  }

  return ancestors;
};

/** @throws {ZeltLifecycleStateError} */
const getLeafToken = <T extends object = object>(cls: AnyClass<T>): LeafInjectionToken<T> => {
  const existing = leafTokenMap.get<T>(cls);
  if (existing) return existing;

  const token = new InjectionToken<T>(leafTokenDescription(cls));
  leafTokenMap.set(cls, token);
  rememberAbstractLeafToken(cls, token);
  return token;
};

export const getAbstractLeafClassFromError = (error: unknown): AnyClass | undefined => {
  if (!(error instanceof Error)) return undefined;
  const prefix = 'No provider(s) found for ';
  if (!error.message.startsWith(prefix)) return undefined;
  return abstractLeafTokenLabels.get(error.message.slice(prefix.length));
};

/** @throws {ZeltLifecycleStateError} */
const isTokenBound = (container: Container, token: LeafInjectionToken): boolean =>
  boundTokens.get(container)?.has(token) ?? false;

/** @throws {ZeltLifecycleStateError} */
const markTokenBound = (container: Container, token: LeafInjectionToken): void => {
  const existing = boundTokens.get(container);
  if (existing) {
    existing.add(token);
    return;
  }
  boundTokens.set(container, new Set([token]));
};

const bindExistingLeaf = (
  container: Container,
  token: LeafInjectionToken,
  existingToken: LeafInjectionToken,
): void => {
  container.bind({ provide: token, useExisting: existingToken });
  markTokenBound(container, token);
};

const bindLeafInternal = (container: Container, token: LeafInjectionToken, cls: AnyClass): void => {
  const singleToken = new InjectionToken<AnyInstance>(`${cls.name}:single`);
  container.bind({
    provide: singleToken,
    useFactory: () => {
      const instance: unknown = Reflect.construct(cls, []);
      if (typeof instance === 'object' && instance !== null) return instance;
      return {};
    },
  });
  container.bind({ provide: token, useExisting: singleToken });
  markTokenBound(container, token);
};

/** @throws {ZeltLifecycleStateError} */
export const overrideLeaf = (
  container: Container,
  cls: AnyClass,
  options?: { readonly fallback?: boolean },
): void => {
  const token = ensureLeafBound(container, cls);
  const ancestorTokens = findAncestorLeafClasses(cls).map((ancestor) => getLeafToken(ancestor));

  for (const ancestorToken of ancestorTokens) {
    if (options?.fallback && isTokenBound(container, ancestorToken)) continue;
    bindExistingLeaf(container, ancestorToken, token);
  }
};

/** @throws {ZeltLifecycleStateError} */
export const ensureLeafBound = <T extends object = object>(
  container: Container,
  cls: AnyClass<T>,
): LeafInjectionToken<T> => {
  const token = getLeafToken(cls);

  if (!isTokenBound(container, token) && !isAbstractLeafClass(cls)) {
    bindLeafInternal(container, token, cls);
  }

  return token;
};

/** @throws {ZeltLifecycleStateError} */
export const getLeaf = <T extends object>(
  container: Container,
  cls: abstract new (...args: never[]) => T,
): T => container.get(ensureLeafBound(container, cls));

export const resolveLeaf = (container: Container, cls: AnyClass): void => {
  const token = ensureLeafBound(container, cls);
  container.get(token);
};
