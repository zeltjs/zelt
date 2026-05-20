import type { Position } from './position';

export type MethodMeta = {
  readonly name: string;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
};

export type PropertyMeta = {
  readonly name: string;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
};

export type ClassMeta = {
  readonly pos: Position | undefined;
  readonly props: readonly object[];
  readonly methods: readonly MethodMeta[];
  readonly properties: readonly PropertyMeta[];
};

const classStore = new WeakMap<object, ClassMeta>();

const emptyMeta = (): ClassMeta => ({
  pos: undefined,
  props: [],
  methods: [],
  properties: [],
});

export const setClassMetadata = (cls: object, pos: Position | undefined, props: object): void => {
  const existing = classStore.get(cls) ?? emptyMeta();
  classStore.set(cls, {
    // Earliest position wins so the class decorator (or first applied decorator)
    // owns the canonical source location.
    pos: existing.pos ?? pos,
    props: [...existing.props, props],
    methods: existing.methods,
    properties: existing.properties,
  });
};

export const getClassMetadata = (cls: object): ClassMeta | undefined => classStore.get(cls);

const upsertMethod = (
  methods: readonly MethodMeta[],
  name: string,
  pos: Position | undefined,
  props: object,
): readonly MethodMeta[] => {
  const existing = methods.find((m) => m.name === name);
  if (!existing) {
    return [...methods, { name, pos, props: [props] }];
  }
  const updated: MethodMeta = {
    name: existing.name,
    pos: existing.pos ?? pos,
    props: [...existing.props, props],
  };
  return methods.map((m) => (m === existing ? updated : m));
};

const upsertProperty = (
  properties: readonly PropertyMeta[],
  name: string,
  pos: Position | undefined,
  props: object,
): readonly PropertyMeta[] => {
  const existing = properties.find((p) => p.name === name);
  if (!existing) {
    return [...properties, { name, pos, props: [props] }];
  }
  const updated: PropertyMeta = {
    name: existing.name,
    pos: existing.pos ?? pos,
    props: [...existing.props, props],
  };
  return properties.map((p) => (p === existing ? updated : p));
};

export const setMethodMetadata = (
  cls: object,
  name: string,
  pos: Position | undefined,
  props: object,
): void => {
  const existing = classStore.get(cls) ?? emptyMeta();
  classStore.set(cls, {
    pos: existing.pos,
    props: existing.props,
    methods: upsertMethod(existing.methods, name, pos, props),
    properties: existing.properties,
  });
};

export const setPropertyMetadata = (
  cls: object,
  name: string,
  pos: Position | undefined,
  props: object,
): void => {
  const existing = classStore.get(cls) ?? emptyMeta();
  classStore.set(cls, {
    pos: existing.pos,
    props: existing.props,
    methods: existing.methods,
    properties: upsertProperty(existing.properties, name, pos, props),
  });
};
