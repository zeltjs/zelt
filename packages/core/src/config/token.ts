import type { ConfigClass } from './types';

type AnyConfigClass = ConfigClass<object>;

// Token (symbol) → 現在登録されている実装クラス
const tokenToClass = new Map<symbol, AnyConfigClass>();

// クラス → そのクラス（または祖先）に紐づくトークン
const classToToken = new WeakMap<AnyConfigClass, symbol>();

const findTokenInChain = (cls: AnyConfigClass): symbol | null => {
  let current: AnyConfigClass | null = cls;
  while (current && current !== Function.prototype) {
    const token = classToToken.get(current);
    if (token) return token;
    current = Object.getPrototypeOf(current) as AnyConfigClass | null;
  }
  return null;
};

export const registerConfigToken = (cls: AnyConfigClass): void => {
  if (classToToken.has(cls)) return;

  const parent = Object.getPrototypeOf(cls) as AnyConfigClass | null;
  const parentToken = parent ? findTokenInChain(parent) : null;

  if (parentToken) {
    classToToken.set(cls, parentToken);
    tokenToClass.set(parentToken, cls);
  } else {
    const newToken = Symbol(`ConfigToken:${cls.name}`);
    classToToken.set(cls, newToken);
    tokenToClass.set(newToken, cls);
  }
};

export const findConfigToken = (cls: AnyConfigClass): AnyConfigClass | null => {
  const token = findTokenInChain(cls);
  if (!token) return null;
  return tokenToClass.get(token) ?? null;
};

export const findRootConfigToken = (cls: AnyConfigClass): AnyConfigClass | null => {
  const token = findTokenInChain(cls);
  if (!token) return null;

  let root: AnyConfigClass | null = null;
  let current: AnyConfigClass | null = cls;
  while (current && current !== Function.prototype) {
    if (classToToken.get(current) === token) {
      root = current;
    }
    current = Object.getPrototypeOf(current) as AnyConfigClass | null;
  }
  return root;
};
