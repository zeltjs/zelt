export type InspectableClass = new (...args: never[]) => unknown;

// core を runtime import しないため構造的型で受ける
export type FeatureLike = {
  readonly key: string;
  readonly featureClasses: () => readonly InspectableClass[];
};

export type AppLike = {
  readonly features: readonly FeatureLike[];
};

export const isAppLike = (value: unknown): value is AppLike => {
  if (typeof value !== 'object' || value === null) return false;
  const record: { features?: unknown } = value;
  return Array.isArray(record.features);
};

const decoratorNameOf = (prop: object): readonly string[] => {
  const record: { decorator?: unknown } = prop;
  return typeof record.decorator === 'string' ? [record.decorator] : [];
};

export const extractDecoratorNames = (props: readonly object[]): readonly string[] =>
  props.flatMap(decoratorNameOf);
