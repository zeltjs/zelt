import type { Container } from '@needle-di/core';
import { InjectionToken } from '@needle-di/core';
import { isClassConstructor, UnsafeInjectionTokenWeakMap } from '@zeltjs/unsafe-type-lib';

type AnyClass<T extends object = object> = new (...args: never[]) => T;
type AnyInstance = object;

type LeafInjectionToken<T extends object = object> = InjectionToken<T>;

const leafClasses = new WeakSet<AnyClass>();
const leafCategoryCache = new WeakMap<AnyClass, 'direct' | 'inherited'>();
const leafTokenMap = new UnsafeInjectionTokenWeakMap();
const boundTokens = new WeakMap<Container, Set<LeafInjectionToken>>();

const toAnyClass = (proto: unknown): AnyClass | null => {
  if (proto === null || proto === Function.prototype) return null;
  return isClassConstructor<AnyInstance>(proto) ? proto : null;
};

export const registerAsLeaf = (cls: AnyClass): void => {
  leafClasses.add(cls);
  leafCategoryCache.set(cls, 'direct');
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

export const findRootLeafClass = (cls: AnyClass): AnyClass => {
  let current: AnyClass | null = cls;
  let root: AnyClass = cls;

  while (current) {
    if (leafClasses.has(current)) {
      root = current;
    }
    current = toAnyClass(Object.getPrototypeOf(current));
  }

  return root;
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

  const token = new InjectionToken<T>(cls.name);
  leafTokenMap.set(cls, token);
  return token;
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

/** @throws {ZeltLifecycleStateError} */
const bindLeafInternal = (container: Container, token: LeafInjectionToken, cls: AnyClass): void => {
  const singleToken = new InjectionToken<AnyInstance>(`${cls.name}:single`);
  container.bind({
    provide: singleToken,
    useFactory: () => new cls(),
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

  if (!isTokenBound(container, token)) {
    bindLeafInternal(container, token, cls);
  }

  return token;
};

/** @throws {ZeltLifecycleStateError} */
export const getLeaf = <T extends object>(
  container: Container,
  cls: new (...args: never[]) => T,
): T => container.get(ensureLeafBound(container, cls));

export const resolveLeaf = (container: Container, cls: AnyClass): void => {
  const token = ensureLeafBound(container, cls);
  container.get(token);
};
