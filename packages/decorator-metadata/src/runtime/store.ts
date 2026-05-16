import type { Position } from './position';

type MethodMeta = {
  readonly name: string;
  readonly pos: Position;
  readonly props: object;
};

type PropertyMeta = {
  readonly name: string;
  readonly pos: Position;
  readonly props: object;
};

type ClassMeta = {
  readonly pos: Position;
  readonly props: object;
  readonly methods: MethodMeta[];
  readonly properties: PropertyMeta[];
};

const classStore = new WeakMap<object, ClassMeta>();

const getMethods = (existing: ClassMeta | undefined): MethodMeta[] => existing?.methods ?? [];

const getProperties = (existing: ClassMeta | undefined): PropertyMeta[] =>
  existing?.properties ?? [];

const getPosition = (existing: ClassMeta | undefined, fallback: Position): Position =>
  existing?.pos ?? fallback;

const getProps = (existing: ClassMeta | undefined): object => existing?.props ?? {};

export const setClassMetadata = (cls: object, pos: Position, props: object): void => {
  const existing = classStore.get(cls);
  classStore.set(cls, {
    pos,
    props,
    methods: getMethods(existing),
    properties: getProperties(existing),
  });
};

export const getClassMetadata = (cls: object): ClassMeta | undefined => classStore.get(cls);

export const setMethodMetadata = (
  cls: object,
  name: string,
  pos: Position,
  props: object,
): void => {
  const existing = classStore.get(cls);
  const methods = getMethods(existing);
  const properties = getProperties(existing);
  const metaPos = getPosition(existing, pos);
  const metaProps = getProps(existing);

  classStore.set(cls, {
    pos: metaPos,
    props: metaProps,
    methods: [...methods, { name, pos, props }],
    properties,
  });
};

export const getMethodMetadata = (cls: object, name: string): MethodMeta | undefined => {
  const meta = classStore.get(cls);
  return meta?.methods.find((m) => m.name === name);
};

export const setPropertyMetadata = (
  cls: object,
  name: string,
  pos: Position,
  props: object,
): void => {
  const existing = classStore.get(cls);
  const methods = getMethods(existing);
  const properties = getProperties(existing);
  const metaPos = getPosition(existing, pos);
  const metaProps = getProps(existing);

  classStore.set(cls, {
    pos: metaPos,
    props: metaProps,
    methods,
    properties: [...properties, { name, pos, props }],
  });
};

export const getPropertyMetadata = (cls: object, name: string): PropertyMeta | undefined => {
  const meta = classStore.get(cls);
  return meta?.properties.find((p) => p.name === name);
};
