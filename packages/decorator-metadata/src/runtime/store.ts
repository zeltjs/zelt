import type { StackTrace } from './position';

export type MethodMeta = {
  readonly name: string;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

export type PropertyMeta = {
  readonly name: string;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

export type ClassMeta = {
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
  readonly methods: readonly MethodMeta[];
  readonly properties: readonly PropertyMeta[];
};

const classStore = new WeakMap<object, ClassMeta>();

const emptyMeta = (): ClassMeta => ({
  trace: undefined,
  props: [],
  methods: [],
  properties: [],
});

export const setClassMetadata = (
  cls: object,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const existing = classStore.get(cls) ?? emptyMeta();
  classStore.set(cls, {
    trace: existing.trace ?? trace,
    props: [...existing.props, props],
    methods: existing.methods,
    properties: existing.properties,
  });
};

export const getClassMetadata = (cls: object): ClassMeta | undefined => classStore.get(cls);

export const ensureClassMeta = (cls: object, trace: StackTrace): void => {
  const existing = classStore.get(cls);
  if (existing?.trace) return;
  const base = existing ?? emptyMeta();
  classStore.set(cls, {
    trace,
    props: base.props,
    methods: base.methods,
    properties: base.properties,
  });
};

const upsertMethod = (
  methods: readonly MethodMeta[],
  name: string,
  trace: StackTrace | undefined,
  props: object,
): readonly MethodMeta[] => {
  const existing = methods.find((m) => m.name === name);
  if (!existing) {
    return [...methods, { name, trace, props: [props] }];
  }
  const updated: MethodMeta = {
    name: existing.name,
    trace: existing.trace ?? trace,
    props: [...existing.props, props],
  };
  return methods.map((m) => (m === existing ? updated : m));
};

const upsertProperty = (
  properties: readonly PropertyMeta[],
  name: string,
  trace: StackTrace | undefined,
  props: object,
): readonly PropertyMeta[] => {
  const existing = properties.find((p) => p.name === name);
  if (!existing) {
    return [...properties, { name, trace, props: [props] }];
  }
  const updated: PropertyMeta = {
    name: existing.name,
    trace: existing.trace ?? trace,
    props: [...existing.props, props],
  };
  return properties.map((p) => (p === existing ? updated : p));
};

export const setMethodMetadata = (
  cls: object,
  name: string,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const existing = classStore.get(cls) ?? emptyMeta();
  classStore.set(cls, {
    trace: existing.trace,
    props: existing.props,
    methods: upsertMethod(existing.methods, name, trace, props),
    properties: existing.properties,
  });
};

export const setPropertyMetadata = (
  cls: object,
  name: string,
  trace: StackTrace | undefined,
  props: object,
): void => {
  const existing = classStore.get(cls) ?? emptyMeta();
  classStore.set(cls, {
    trace: existing.trace,
    props: existing.props,
    methods: existing.methods,
    properties: upsertProperty(existing.properties, name, trace, props),
  });
};
