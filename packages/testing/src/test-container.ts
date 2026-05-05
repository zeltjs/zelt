import { Container } from '@needle-di/core';
import type { Token } from '@needle-di/core';

let baseContainer: Container | null = null;

type PickedProvider<T> = {
  provide: Token<T>;
  useValue: Partial<T>;
};

type CreateContainerParams = <T, A extends unknown[]>(
  token: Token<T>,
  providers?: { [K in keyof A]: PickedProvider<A[K]> },
) => { target: T; container: Container };

export const createTestContainer: CreateContainerParams = (targetClass, providers) => {
  const baseContainer = getBaseContainer();
  const childContainer = baseContainer.createChild();
  providers?.map((p) => childContainer.bind(p));
  const target = childContainer.get(targetClass); // 依存関係を解決してインスタンスを生成
  return { target, container: childContainer };
};

const getBaseContainer = () => {
  if (baseContainer) {
    return baseContainer;
  }
  baseContainer = new Container();

  // 本来は利用側で必要なものをdummy inject する
  // (zelt framework 自体は default 持たない)

  return baseContainer;
};
