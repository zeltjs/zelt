import type { Container as ContainerType } from '@needle-di/core';
import { InjectionToken } from '@needle-di/core';

type AnyClass = new (...args: never[]) => unknown;
type AnyInstance = object;

declare const rootLeafBrand: unique symbol;
type RootLeafClass = AnyClass & { [rootLeafBrand]: unknown };

type LeafInjectionToken = InjectionToken<AnyInstance>;

const leafClasses = new WeakSet<AnyClass>();
const leafCategoryCache = new WeakMap<AnyClass, 'direct' | 'inherited'>();
const leafTokenMap = new WeakMap<RootLeafClass, LeafInjectionToken>();
const boundTokens = new WeakMap<ContainerType, Set<LeafInjectionToken>>();

const toAnyClass = (proto: unknown): AnyClass | null => {
  if (proto === null || proto === Function.prototype) return null;
  const result: AnyClass = proto as AnyClass;
  return result;
};

const toRootLeafClass = (cls: AnyClass): RootLeafClass => {
  const result: RootLeafClass = cls as RootLeafClass;
  return result;
};

export const registerAsLeaf = (cls: AnyClass): void => {
  leafClasses.add(cls);
  leafCategoryCache.set(cls, 'direct');
};

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

export const findRootLeafClass = (cls: AnyClass): RootLeafClass => {
  let current: AnyClass | null = cls;
  let root: AnyClass = cls;

  while (current) {
    if (leafClasses.has(current)) {
      root = current;
    }
    current = toAnyClass(Object.getPrototypeOf(current));
  }

  return toRootLeafClass(root);
};

const getLeafToken = (rootClass: RootLeafClass): LeafInjectionToken => {
  const existing = leafTokenMap.get(rootClass);
  if (existing) return existing;

  const token = new InjectionToken<AnyInstance>(rootClass.name);
  leafTokenMap.set(rootClass, token);
  return token;
};

const isTokenBound = (container: ContainerType, token: LeafInjectionToken): boolean =>
  boundTokens.get(container)?.has(token) ?? false;

const markTokenBound = (container: ContainerType, token: LeafInjectionToken): void => {
  const existing = boundTokens.get(container);
  if (existing) {
    existing.add(token);
    return;
  }
  boundTokens.set(container, new Set([token]));
};

const bindLeafInternal = (
  container: ContainerType,
  token: LeafInjectionToken,
  cls: AnyClass,
): void => {
  const singleToken = new InjectionToken<AnyInstance>(`${cls.name}:single`);
  const factory = cls as new () => AnyInstance;
  container.bind({
    provide: singleToken,
    useFactory: () => new factory(),
  });
  container.bind({ provide: token, useExisting: singleToken });
  markTokenBound(container, token);
};

export const overrideLeaf = (
  container: ContainerType,
  cls: AnyClass,
  options?: { readonly fallback?: boolean },
): void => {
  const rootClass = findRootLeafClass(cls);
  const token = getLeafToken(rootClass);

  if (options?.fallback && isTokenBound(container, token)) return;

  if (!isTokenBound(container, token)) {
    bindLeafInternal(container, token, rootClass);
  }

  if (cls !== (rootClass as AnyClass)) {
    bindLeafInternal(container, token, cls);
  }
};

export const ensureLeafBound = (container: ContainerType, cls: AnyClass): LeafInjectionToken => {
  const rootClass = findRootLeafClass(cls);
  const token = getLeafToken(rootClass);

  if (!isTokenBound(container, token)) {
    bindLeafInternal(container, token, rootClass);
  }

  return token;
};

export const getLeaf = <T extends object>(
  container: ContainerType,
  cls: new (...args: never[]) => T,
): T => container.get(ensureLeafBound(container, cls)) as T;

export const resolveLeaf = (container: ContainerType, cls: AnyClass): void => {
  const rootClass = findRootLeafClass(cls);
  const token = getLeafToken(rootClass);
  container.get(token);
};
